var serialport = require("serialport");
var fs = require("fs");
var events = require('events');
var async = require('async');
var util = require('util');
var Queue = require('./util').Queue;
var Watchdog = require('./util').Watchdog;
var log = require('./log').logger('driver');
var process = require('process');

// Values of the **stat** field that is returned from TinyG status reports
var STAT_INIT = 0;
var STAT_READY = 1;
var STAT_ALARM = 2;
var STAT_STOP = 3;
var STAT_END = 4;
var STAT_RUNNING = 5;
var STAT_HOLDING = 6;
var STAT_PROBE = 7;
var STAT_CYCLING = 8;
var STAT_HOMING = 9;

// Should take no longer than CMD_TIMEOUT to do a get or a set operation
var CMD_TIMEOUT = 30000;
var EXPECT_TIMEOUT = 5000;

// When jogging, "keepalive" jog commands must arrive faster than this interval (ms)
// This can be slowed down if necessary for spotty connections, but a slow timeout means
// the machine has more time to run away before stopping.
var JOG_TIMEOUT = 500;

var GCODE_BLOCK_SEND_SIZE = 1000;
var GCODE_MIN_LINE_THRESH = 250;

// Map used by the jog command to turn incoming direction specifiers to g-code
var JOG_AXES = {'x':'X', 
				'-x':'X-', 
				'y':'Y',
				'-y':'Y-',
				'z':'Z',
				'-z':'Z-',
				'a':'A',
				'-a':'A-',
				'b':'B',
				'-b':'B-',
				'c':'C',
				'-c':'C-'};

// Error codes defined by TinyG
// See https://github.com/synthetos/TinyG/blob/edge/firmware/tinyg/tinyg.h for the latest error codes and messages
try {
	var TINYG_ERRORS = JSON.parse(fs.readFileSync('./data/tinyg_errors.json','utf8'));
} catch(e) {
	var TINYG_ERRORS = {};
}

// TinyG Constructor
function TinyG() {
	this.name = "tinyg";
	this.current_data = [];
	this.current_gcode_data = [];
	this.tinyg_status = {'stat':null, 'posx':0, 'posy':0, 'posz':0};
	this.status = {'stat':'idle', 'posx':0, 'posy':0, 'posz':0};

	this.gcode_queue = new Queue();
	this.watchdog = new Watchdog(10000,14); //time, exit code
	this.pause_flag = false;
	this.connected = false;

	// Jogging state
	this.jog_stop_pending = false;
	this.jog_direction = null;
	this.jog_command = null;
	this.jog_heartbeat = null;

	// Feedhold/flush
	this.quit_pending = false;
	this.stat = null;
	this.hold = null;

	// Readers and callbacks
	this.expectations = [];
	this.readers = {};

	// Members related to streaming
	this.qtotal = 0;
	this.flooded = false;
	this.send_rate = 1;
	this.lines_sent = 0;

	// Event emitter inheritance and behavior setup
	events.EventEmitter.call(this);	
	this.setMaxListeners(50);
}
util.inherits(TinyG, events.EventEmitter);

// Actually open the serial port and configure TinyG based on stored settings
TinyG.prototype.connect = function(control_path, gcode_path, callback) {

	// Store paths for safe keeping
	this.control_path = control_path;
	this.gcode_path = gcode_path;

	// Called once BOTH ports have been opened
	this.connect_callback = callback;

	// Open both ports
	log.info('Opening control port ' + control_path);
	this.control_port = new serialport.SerialPort(control_path, {rtscts:true, baudrate:115200}, false);
	if(control_path !== gcode_path) {
		log.info("Dual USB since control port and gcode port are different. (" + this.control_path + "," + this.gcode_path + ")");
		this.gcode_port = new serialport.SerialPort(gcode_path, {rtscts:true}, false);
	} else {
		log.info("Single USB since control port and gcode port are the same. (" + this.control_path + ")");
		this.gcode_port = this.control_port;
	}

	// Handle errors
	this.control_port.on('error', this.onSerialError.bind(this));

	// Handle closing
	this.control_port.on('close', this.onSerialClose.bind(this));

	// The control port is the only one to truly handle incoming data
	this.control_port.on('data', this.onData.bind(this));
	if(this.gcode_port !== this.control_port) {
		this.gcode_port.on('error', this.onSerialError.bind(this));
		this.control_port.on('close', this.onSerialClose.bind(this));
		this.gcode_port.on('data', this.onWAT.bind(this));
	}

	var onOpen = function(callback) {
		this.controlWrite("\x18");
		this.gcodeWrite("{clear:true}\n");
		this.command("M30");
		this.requestStatusReport();
		setTimeout(function() {
			this.setPacketMode(function () {
				this.connected = true;
				callback(null, this);
			}.bind(this));
		}.bind(this), 8000);
	}.bind(this);

	this.control_port.open(function(error) {
		if(error) {
			log.error("ERROR OPENING CONTROL PORT " + error );
			return callback(error);
		}

		if(this.control_port !== this.gcode_port) {
			this.gcode_port.open(function(error) {
				if(error) {
					log.error("ERROR OPENING GCODE PORT " + error );
					return callback(error);
				}
				onOpen(callback);
			}.bind(this));
		} else {
			onOpen(callback);
		}
	}.bind(this));
};

TinyG.prototype.disconnect = function(callback) {
	this.watchdog.stop();
	if(this.control_port !== this.gcode_port) {
		this.control_port.close(function(callback) {
			this.gcode_port.close(callback);   
		}.bind(this));
	} else {
		this.control_port.close(callback);
	}

};

// Log serial errors.  Most of these are exit-able offenses, though.
TinyG.prototype.onSerialError = function(data) {
	log.error('serial error : ' + data);
	//if(this.connect_callback) {
	//	this.connect_callback(data);
	//}
};

TinyG.prototype.onSerialClose = function(data) {
	this.connected= false;
	log.error('TinyG Core serial link was lost.')
	process.exit(14);
};

// Write data to the control port.  Log to the system logger.
TinyG.prototype.controlWrite = function(s) {
	if (s.length !== 1) {
		this.watchdog.start();
	}
	t = new Date().getTime();
	log.driver('--C-' + t + '----> ' + s.trim());
	this.control_port.write(s);
};

// Write data to the gcode port.  Log to the system logger.
TinyG.prototype.gcodeWrite = function(s) {
	this.watchdog.start();
	t = new Date().getTime();
	log.driver('--G-' + t + '----> ' + s.trim());
	this.gcode_port.write(s);
};

// Write data to the serial port.  Log to the system logger.  Execute **callback** when transfer is complete.
TinyG.prototype.controlWriteAndDrain = function(s, callback) {
	this.watchdog.start();
	t = new Date().getTime();
	log.driver('--C-' + t + '----> ' + s);
	this.control_port.write(s, function () {
		this.control_port.drain(callback);
	}.bind(this));
};

TinyG.prototype.gcodeWriteAndDrain = function(s, callback) {
	this.watchdog.start();
	t = new Date().getTime();
	log.driver('--G-' + t + '----> ' + s);
	this.gcode_port.write(s, function () {
		this.gcode_port.drain(callback);
	}.bind(this));
};

TinyG.prototype.clearAlarm = function() {
	this.watchdog.start();
	this.command({"clear":null});
};

// Start or continue jogging in the direction provided, which is one of x,-x,y,-y,z-z,a,-a,b,-b,c,-c
TinyG.prototype.jog = function(direction) {

	var MOVES = 10;
	var FEED_RATE = 60.0;			// in/min
	var MOVE_DISTANCE = 0.05;		// in
	var START_DISTANCE = 0.001; 	// sec
	var START_RATE = 10.0;

	// Normalize the direction provided by the user
	direction = String(direction).trim().toLowerCase().replace(/\+/g,"");

	if ( !(direction in JOG_AXES) && !jog_stop_pending ) {
		this.stopJog();
	}
	else if(this.jog_direction === null) {
		this.jog_stop_pending = false;

		// Build a block of short moves to start jogging
		// Starter move (plans down to zero no matter what so we make it short)
		var d = JOG_AXES[direction];

		// Continued burst of short moves
		var starting_cmd = 'G91 G1 ' + d + START_DISTANCE + ' F' + START_RATE;
		var move = 'G91 G1 ' + d + MOVE_DISTANCE + ' F' + FEED_RATE;

		// Compile moves into a list
		var codes = [starting_cmd];

		// Create string buffer of moves from list
		for(var i=0; i<MOVES; i++) {codes.push(move);}

		// The queue report handler will keep up the jog if these are set
		this.jog_command = move;
		this.jog_direction = direction;

		// Build serial string and send
		try {
			this.gcodeWrite(codes.join('\n'));
		} finally {
			// Timeout jogging if we don't get a keepalive from the client
			this.jog_heartbeat = setTimeout(function() {
				log.warn("Jog abandoned!  Stopping due to timeout.");
				this.stopJog();
			}.bind(this), JOG_TIMEOUT);
		}
	} else {
		if(direction == this.jog_direction) {
			this.jog_keepalive();
		}
	}
};

// Start or continue jogging in the direction provided, which is one of x,-x,y,-y,z-z,a,-a,b,-b,c,-c
TinyG.prototype.fixed_move = function(direction,step,speed) {
	if(this.quit_pending){ 
		log.warn("WARNING QUIT PENDING WHILE DOING A FIXED MOVE")
	}
	var mstep = parseFloat(step ? step : 0.01).toFixed(5);
	var speed = parseFloat(speed || 60.0).toFixed(2);

	// Normalize the direction provided by the user
	direction = String(direction).trim().toLowerCase().replace(/\+/g,"");

	if ( !(direction in JOG_AXES)) {
		return;
	}
	else {
		var d = JOG_AXES[direction];
		var move;
		if(mstep > 0.005) {
			mstep -= 0.005;
			mstep = mstep.toFixed(5)
			var move = 'G91 G1 ' + d + 0.005 + ' F' + speed + '\n' +'G1' + d + mstep + 'F' + speed + '\n';
		} else {
			move = 'G91 G1 ' + d + mstep + ' F' + speed;
		}
		this.gcodeWrite(move);
	} 
};

TinyG.prototype.jog_keepalive = function() {
	log.info('Keeping jog alive.');
	clearTimeout(this.jog_heartbeat);
	this.jog_heartbeat = setTimeout(this.stopJog.bind(this), JOG_TIMEOUT);
};

TinyG.prototype.stopJog = function() {
	if(this.jog_direction && !this.jog_stop_pending) {
		log.debug('stopJog()');
		this.jog_stop_pending = true;
		clearTimeout(this.jog_heartbeat);
		if(this.status.stat === STAT_RUNNING) {
			this.quit();
		}
	}
};

TinyG.prototype.setUnits = function(units, callback) {
	if(units === 0 || units == 'in') {
		gc = 'G20';
		units = 0;
	} else if(units === 1 || units === 'mm') {
		gc = 'G21';
		units = 1;
	} else {
		return callback(new Error('Invalid unit setting: ' + units))
	}
	this.set('gun', units, function() {
		this.runString(gc, function() {
			this.requestStatusReport(function(status) {
				callback(null);
			}.bind(this));
		}.bind(this));		
	}.bind(this));
}

TinyG.prototype.requestStatusReport = function(callback) {
	// Register the callback to be called when the next status report comes in
	typeof callback === 'function' && this.once('status', callback);
	this.command({'sr':null}); 
};

TinyG.prototype.requestQueueReport = function() { this.command({'qr':null}); };

TinyG.prototype.onWAT = function(data) {
	var s = data.toString('ascii');
	var len = s.length;
	for(var i=0; i<len; i++) {
		c = s[i];
		if(c === '\n') {
			string = this.current_gcode_data.join('');
			t = new Date().getTime();
			log.driver('<-G--' + t + '---- ' + string);
			this.current_gcode_data = [];
		} else {
			this.current_gcode_data.push(c);
		}
	}

};
// Called for every chunk of data returned from TinyG
TinyG.prototype.onData = function(data) {
	t = new Date().getTime();
	//log.debug('<----' + t + '---- ' + data);
	this.emit('raw_data',data);
	var s = data.toString('ascii');
	var len = s.length;
	for(var i=0; i<len; i++) {
		c = s[i];
		if(c === '\n') {
			var json_string = this.current_data.join('');
			t = new Date().getTime();
			log.driver('<-C--' + t + '---- ' + json_string);
			obj = null;
			try {
				obj = JSON.parse(json_string);
			}catch(e){
				// A JSON parse error usually means the asynchronous LOADER SEGMENT NOT READY MESSAGE
				if(json_string.trim() === '######## LOADER - SEGMENT NOT READY') {
					this.emit('error', [-1, 'LOADER_SEGMENT_NOT_READY', 'Asynchronous error: Segment not ready.']);
				} else {
					this.emit('error', [-1, 'JSON_PARSE_ERROR', "Could not parse response: '" + json_string + "' (" + e.toString() + ")"]);
				}
			} finally {
				if(obj) {
					this.onMessage(obj);
				}
			}
			this.current_data = [];
		} else {
			this.current_data.push(c);
		}
	}
};

TinyG.prototype.handleQueueReport = function(r) {
	// Deal with jog mode
	var qo = r.qo || 0;
	if(this.jog_command && (qo > 0)) {
		this.gcodeWrite(this.jog_command + '\n');
		return;
	}
};

TinyG.prototype.handleFooter = function(response) {
	if(response.f) {
		if(response.f[1] !== 0) {
			var err_code = response.f[1];
			var err_msg = TINYG_ERRORS[err_code] || ['ERR_UNKNOWN', 'Unknown Error'];
			// TODO we'll have to go back and clean up alarms later
			// For now, let's not emit a bunch of errors into the log that don't mean anything to us
			this.emit('error', [err_code, err_msg[0], err_msg[1]]);
		}
		// handle packet mode line numbers
		if (response.f[0] === 3) {
			if (response.r && response.r["rxm"] === 1) {
				// rxm mode entered, record total number of slots
				this.slotsTotal = response.f[2];
				log.driver("Packet Mode established : " + this.slotsTotal + " slots");
			}
			this.slotsAvailable = response.f[2];

			if(this.slotsAvailable > 2) {
				if(this.gcode_queue.getLength() > 0) {
					log.warn("There are " + this.slotsAvailable + " sending more...");
					this.sendMoreGCodes();
				}
			}
		}
	}
};

TinyG.prototype.handleExceptionReport = function(response) {
	if(response.er) {
		var stat = response.er.st;
		if(((stat === 204) || (stat === 207)) && this.quit_pending) {
			this.gcodeWrite("{clear:n}\nM30\n");
			this.quit_pending = false;
		}
	}
};
/*
0	machine is initializing
1	machine is ready for use
2	machine is in alarm state (shut down)
3	program stop or no more blocks (M0, M1, M60)
4	program end via M2, M30
5	motion is running
6	motion is holding
7	probe cycle active
8	machine is running (cycling)
9	machine is homing
*/
TinyG.prototype.handleStatusReport = function(response) {
	if(response.sr) {

		// Update our copy of the system status
		for (var key in response.sr) {
			value = response.sr[key];
			if(key === 'unit') {
				value = value === 0 ? 'in' : 'mm';
			}

			this.status[key] = value;
		}

		// Emit status no matter what
		this.emit('status', this.status);

		if('stat' in response.sr) {
			if(response.sr.stat === STAT_STOP) {
				if(this.flushcallback) {
					this.flushcallback(null);
					this.flushcallback = null;
				}
			}
			if(this.expectations.length > 0) {
				var expectation = this.expectations.pop();
				var stat = states[this.status.stat];
				if(stat in expectation) {
					if(expectation[stat] === null) {
						this.expectations.push(expectation);
					} else {
						expectation[stat](this);
					}
				} else if(null in expectation) {
					expectation[null](this);
				}
			}
		}

		this.stat = this.status.stat !== undefined ? this.status.stat : this.stat;
		this.hold = this.status.hold !== undefined ? this.status.hold : this.hold;

	}
};

// Called once a proper JSON response is decoded from the chunks of data that come back from TinyG
TinyG.prototype.onMessage = function(response) {
	this.watchdog.stop();
	// TODO more elegant way of dealing with "response" data.
	if(response.r) {
		this.emit('response', false, response.r);
		r = response.r;
	} else {
		r = response;
	}

	// Deal with TinyG status (top priority)
	this.handleStatusReport(r);

	// Deal with exceptions
	this.handleExceptionReport(r);

	// Deal with streaming (if response contains a queue report)
	this.handleQueueReport(r);

	// Deal with footer
	this.handleFooter(response); 

	// Emitted everytime a message is received, regardless of content
	this.emit('message', response);

	for(var key in r) {
		if(key in this.readers) {
			if(typeof this.readers[key][this.readers[key].length-1] === 'function') {
				//if(r[key] !== null) {
					callback = this.readers[key].shift();
					callback(null, r[key]);
				//}
			}
		}
	}
	// Special message type for initial system ready message
	if(r.msg && (r.msg === "SYSTEM READY")) {
		this.emit('ready', this);
	}
};

TinyG.prototype.feedHold = function(callback) {
	this.pause_flag = true;
	this.flooded = false;
	typeof callback === 'function' && this.once('state', callback);
	log.debug("Sending a feedhold");
	this.controlWriteAndDrain('!\n', function() {
		log.debug("Drained.");   
	});
};

TinyG.prototype.queueFlush = function(callback) {
	log.debug('Clearing the queue.');
	this.flushcallback = callback;
	this.controlWrite('%\n');
};

TinyG.prototype.resume = function() {
	this.controlWrite('~\n'); //cycle start command character
	this.pause_flag = false;
};


TinyG.prototype.quit = function() {
	this.quit_pending = true;
	this.gcode_queue.clear();
	this.controlWrite('\x04');
}

TinyG.prototype.get = function(key, callback) {
	var keys;
	if(key instanceof Array) {
		keys = key;
		is_array = true;
	} else {
		is_array = false;
		keys = [key];
	}
	async.mapSeries(keys, 

		// Function called for each item in the keys array
		function(k, cb) {
			cb = cb.bind(this);
			cmd = {};
			cmd[k] = null;

			if(k in this.readers) {
				this.readers[k].push(cb);
			} else {
				this.readers[k] = [cb];
			}

			// Ensure that an errback is called if the data isn't read out
			setTimeout(function() {
				if(k in this.readers) {
						callbacks = this.readers[k];
						stored_cb = callbacks[callbacks.length-1];
						if(cb == stored_cb) {
							if(typeof cb == 'function') {
								this.readers[k].shift();
								cb(new Error("Timeout"), null);
							}
						}
					}
			}.bind(this), CMD_TIMEOUT);

			this.command(cmd);
		}.bind(this),
	
		// Function to call with the list of results
		function(err, result) {
			if(err) {
				return callback(err, result);
			} else {
				// If given an array, return one.  Else, return a single item.
				if(is_array) {
					return callback(err, result);
				} else {
					return callback(err, result[0]);
				}
			}
		}
	);
};

TinyG.prototype.setMany = function(obj, callback) {
	var keys = Object.keys(obj);
	async.mapSeries(keys, 
		// Function called for each item in the keys array
		function(k, cb) {
			cmd = {};
			cmd[k] = obj[k];
			if(k in this.readers) {
				this.readers[k].push(cb.bind(this));
			} else {
				this.readers[k] = [cb.bind(this)];
			}
			this.command(cmd);
		}.bind(this),

		// Function to call with the list of results
		function(err, result) {
			if(err) {
				return callback(err, result);
			} else {
				var retval = {};
				try {
					for(i=0; i<keys.length; i++) {
						retval[keys[i]] = result[i];
					}
				} catch(e) {
					callback(e, null);
				}
				return callback(null, retval);
			}
		}
	);
};

TinyG.prototype.set = function(key, value, callback) {
	cmd = {};
	cmd[key] = value;
	if (key in this.readers) {
		this.readers[key].push(callback);
	} else {
		this.readers[key] = [callback];
	}

	// Ensure that an errback is called if the data isn't read out
	setTimeout(function() {
		if(key in this.readers) {
			callbacks = this.readers[key];
			stored_cb = callbacks[callbacks.length-1];
			if(callback == stored_cb) {
				if(typeof callback == 'function') {
					this.readers[key].shift();
					callback(new Error("Timeout"), null);
				}
			}
		}
	}.bind(this), CMD_TIMEOUT);

	this.command(cmd);
};

// Send a command to TinyG (can be string or JSON)
TinyG.prototype.command = function(obj) {
	var cmd;
	if((typeof obj) == 'string') {
		cmd = obj.trim();
		//this.controlWrite('{"gc":"'+cmd+'"}\n');
		this.gcodeWrite(cmd + '\n');
	} else {
		cmd = JSON.stringify(obj);
		this.controlWrite(cmd + '\n');
	}
};

// Send a (possibly multi-line) string
// An M30 will be placed at the end to put the machine back in the "idle" state
TinyG.prototype.runString = function(data, callback) {
	this.runSegment(data + "\nM30\n", callback);
};

TinyG.prototype.runImmediate = function(data, callback) {
	this.expectStateChange( {
		'end':callback,
		'stop':callback,
		'timeout':function() {
			callback(new Error("Timeout while running immediate gcode"));
		}
	});
	this.runString(data);
};

TinyG.prototype.setPacketMode = function(callback) {
	this.setMany({
		'ej': 1,
		'rxm': 1,
	}, callback);
};

// Send a (possibly multi-line) string
TinyG.prototype.runSegment = function(data, callback) {
	line_count = 0;

	// Divide string into a list of lines
	lines = data.split('\n');

	// Cleanup the lines and enqueue
	for(var i=0; i<lines.length; i++) {
		line_count += 1;
		line = lines[i].trim().toUpperCase();
		if(callback) {
			callback.line = line_count;
		}
		this.gcode_queue.enqueue(line);
	}

	this.lines_sent = 0;
	this.sendMoreGCodes();

	// Kick off the run if any lines were queued
	if(line_count > 0) {
		this.pause_flag = false;
		typeof callback === "function" && callback(null);
	} else {
		typeof callback === "function" && callback(new Error("No G-codes were present in the provided string"));
	}
};

TinyG.prototype.sendMoreGCodes = function() {
	// dequeue enough gcode lines to fill most of the slots
	// we're leaving 2 on the table here so we have a buffer in case a control is about to fill it
	// and we want one left for a future imminent control
	if (this.slotsAvailable > 2) {
		codes = this.gcode_queue.multiDequeue(this.slotsAvailable - 2);
		if(codes.length > 0) {
			this.gcodeWrite(codes.join('\n') + '\n');
		}
	}
};

TinyG.prototype.setMachinePosition = function(position, callback) {
	var gcode = "G21\nG28.3 ";
	['x','y','z','a','b','c'].forEach(function(axis) {
		if(position[axis] != undefined) {
			gcode += ' ' + axis + position[axis].toFixed(3);
		}		
	});

	if(this.status.unit === 'in') {
		gcode += '\nG20';
	}
	this.runString(gcode, callback);
}

// Function works like "once()" for a state change
// callbacks is an associative array mapping states to callbacks
// If the *next* state change matches a state in the associative array, the callback it maps to is called.
// If null is specified in the array, this callback is used for any state that is unspecified
//
// eg:
// this.expectStateChange {
//                          STAT_END : end_callback,
//                          STAT_PAUSE : pause_callback,
//                          null : other_callback};
//
// In the above example, when the next change of state happens, the appropriate callback is called in the case
// that the new state is either STAT_END or STAT_PAUSE.  If the new state is neither, other_callback is called.

TinyG.prototype.expectStateChange = function(callbacks) {
	if("timeout" in callbacks) {
		var fn = callbacks.timeout;
		setTimeout(function() {
			if(this.expectations.length > 0) {
				callbacks = this.expectations[this.expectations.length-1];
				if(callbacks.timeout === fn) {
					log.debug("Calling timeout function");
					this.expectations.pop();
					fn(this);
				}
			}
		}.bind(this), EXPECT_TIMEOUT);
	}
	this.expectations.push(callbacks);
};

TinyG.prototype.getVersion = function(callback) {
	log.info("Getting TinyG firmware version...");
    this.get('fb', function(err, value) {
        if(err) {
            log.error('Could not get the TinyG firmware build. (' + err + ')');
        } else {
            log.info('TinyG Firmware Build: ' + value);
        }
        callback(null);
    });
};

states = {
	0 : "init",
	1 : "ready",
	2 : "alarm",
	3 : "stop",
	4 : "end" ,
	5 : "running",
	6 : "holding",
	7 : "probe",
	8 : "cycling",
	9 : "homing"
};

state = function(s) {
	return states[s];
};

// export the class
exports.TinyG = TinyG;

exports.STAT_INIT = STAT_INIT;
exports.STAT_READY = STAT_READY;
exports.STAT_ALARM = STAT_ALARM;
exports.STAT_STOP = STAT_STOP;
exports.STAT_END = STAT_END;
exports.STAT_RUNNING = STAT_RUNNING;
exports.STAT_HOLDING = STAT_HOLDING;
exports.STAT_PROBE = STAT_PROBE;
exports.STAT_CYCLING = STAT_CYCLING;
exports.STAT_HOMING = STAT_HOMING;

TinyG.prototype.STAT_INIT = STAT_INIT;
TinyG.prototype.STAT_READY = STAT_READY;
TinyG.prototype.STAT_ALARM = STAT_ALARM;
TinyG.prototype.STAT_STOP = STAT_STOP;
TinyG.prototype.STAT_END = STAT_END;
TinyG.prototype.STAT_RUNNING = STAT_RUNNING;
TinyG.prototype.STAT_HOLDING = STAT_HOLDING;
TinyG.prototype.STAT_PROBE = STAT_PROBE;
TinyG.prototype.STAT_CYCLING = STAT_CYCLING;
TinyG.prototype.STAT_HOMING = STAT_HOMING;
