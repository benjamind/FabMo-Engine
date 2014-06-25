/*
 * g2.js
 * 
 * TinyG2 driver for node.js
 * 
 * Dependencies: serialport
 *
 */
var serialport = require("serialport");
var fs = require("fs");
var events = require('events');
var util = require('util');
var Queue = require('./util').Queue;
var config = require('./configuration')

var STAT_INIT = 0;
var STATE_READY = 1;
var STAT_ALARM = 2
var STAT_STOP = 3;
var STAT_END = 4;
var STAT_RUNNING = 5;
var STAT_HOLDING = 6;
var STAT_PROBE = 7;
var STAT_CYCLING = 8;
var STAT_HOMING = 9;

// Constants
var JOG_TIMEOUT = 500;

// Constant Data
try {
	var G2_ERRORS = JSON.parse(fs.readFileSync('./data/g2_errors.json','utf8'));
} catch(e) {
	var G2_ERRORS = {};
}

// G2 Constructor
function G2() {
	this.current_data = new Array();
	this.status = {'stat':null, 'posx':0, 'posy':0, 'posz':0};
	this.gcode_queue = new Queue();
	this.pause_flag = false;
	this.connected = false;
	this.jog_direction = null;
	this.jog_command = null;
	this.jog_heartbeat = null;
	this.quit_pending = false;
	this.path = "";

	// Hacky stuff related to streaming
	this.flooded = false;
	this.send_rate = 1;

	// Hacky stuff related to jogging
	this.quit_lock = false;

	events.EventEmitter.call(this);	
};
util.inherits(G2, events.EventEmitter);

// toString override added to prototype of Foo class
G2.prototype.toString = function() {
    return "[G2 Driver on '" + this.path + "']";
}

G2.prototype.connect = function(path, callback) {
	this.path = path;
	this.connect_callback = callback;
 	this.port = new serialport.SerialPort(path, {rtscts:true});
	this.port.on("open", this.onOpen.bind(this));
	this.port.on("error", this.onSerialError.bind(this));
	this.on("connect", callback);
}

// Called when the serial port is actually opened.
G2.prototype.onOpen = function(data) {
	// prototype.bind makes sure that the 'this' in the method is this object, not the event emitter
	this.port.on('data', this.onData.bind(this));
	//this.quit();
	this.command({'qv':2});				// Configure queue reports to verbose
	this.requestStatusReport(); 		// Initial status check
	this.connected = true;

	// Load configuration from disk
	this.configure(config);

	this.emit("connect", false, this);
};

G2.prototype.onSerialError = function(data) {
	console.log('SERIAL ERROR');
	console.log(data);
}

G2.prototype.write = function(s) {
	//console.log('----> ' + s);
	this.port.write(s);
}

G2.prototype.writeAndDrain = function(s, callback) {
	//console.log('----> ' + s);
	this.port.write(s, function () {
		this.port.drain(callback);
	}.bind(this));
}

G2.prototype.configure = function(configuration) {
	// Load the configuration file
	for(var i=0; i<configuration.length; i++) {
		this.command(configuration[i]);
	}
}

G2.prototype.jog = function(direction) {

	// Hack due to g2 flush-queue weirdness
	if(this.quit_lock) {return;}

	var MOVES = 10;
	var FEED_RATE = 60.0;			// in/min
	var MOVE_DISTANCE = 0.1;		// in
	var START_DISTANCE = 0.020; 	// in

	direction = String(direction).trim().toLowerCase().replace(/\+/g,"");
	axes = {'x':'X', 
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
	    	'-c':'C-'}

	if (!(direction in axes)) {
		this.stopJog();
		return;
	}
	if(this.jog_direction == null) {
		// Construct g-codes
		// A G91 (go to relative mode)
		// A starter move, which plans down to a stop no matter what, so we make it short
		// Followed by a short flood of relatively short, but reasonably sized moves
		var d = axes[direction];
		var starting_move = 'G1' + d + START_DISTANCE + 'F' + FEED_RATE;
		var move = 'G1' + d + MOVE_DISTANCE + 'F' + FEED_RATE;
		var codes = ['G91', starting_move];

		// Repeat g-codes to fill the buffer
		for(var i=0; i<MOVES; i++) {codes.push(move);}

		// The queue report handler will keep up the jog if these are set
		this.jog_command = move;
		this.jog_direction = direction;

		// Build serial string and send
		this.port.write(codes.join('\n'));

		// Timeout jogging if we don't get a keepalive from the client
		this.jog_heartbeat = setTimeout(this.stopJog.bind(this), JOG_TIMEOUT);
	} else {
		if(direction == this.jog_direction) {
			this.jog_keepalive();
		}
	}
}

G2.prototype.jog_keepalive = function() {
	clearTimeout(this.jog_heartbeat);
	this.jog_heartbeat = setTimeout(this.stopJog.bind(this), JOG_TIMEOUT);
}

G2.prototype.stopJog = function() {
	if(this.jog_direction) {
		clearTimeout(this.jog_heartbeat);
		this.jog_direction = null;
		this.jog_command = null;
		this.quit();
	}
}

G2.prototype.requestStatusReport = function(callback) {
	// Register the callback to be called when the next status report comes in
	typeof callback === 'function' && this.once('status', callback);
	this.command({'sr':null}); 
}

G2.prototype.requestQueueReport = function() { this.command({'qr':null}); }

// Called for every chunk of data returned from G2
G2.prototype.onData = function(data) {
	var s = data.toString('ascii');
	var len = s.length;
	for(var i=0; i<len; i++) {
		c = s[i];
		if(c === '\n') {
			var json_string = this.current_data.join('');
		    try {
		    	console.log(json_string);
		    	obj = JSON.parse(json_string);
		    	this.onMessage(obj);
		    }catch(e){
		    	// A JSON parse error usually means the asynchronous LOADER SEGMENT NOT READY MESSAGE
		    	if(json_string.trim() === '######## LOADER - SEGMENT NOT READY') {
		    		this.emit('error', [-1, 'LOADER_SEGMENT_NOT_READY', 'Asynchronous error: Segment not ready.'])
		    	} else {
		    		this.emit('error', [-1, 'JSON_PARSE_ERROR', "Could not parse response: '" + json_string + "' (" + e.toString() + ")"])
		    	}
		    }
			this.current_data = new Array();
		} else {
			this.current_data.push(c);
		}
	}
};

G2.prototype.handleQueueReport = function(r) {
	var FLOOD_LEVEL = 20;
	var MIN_QR_LEVEL = 5;

	if(this.pause_flag) {
		// If we're here, a pause is requested, and we don't send anymore g-codes.
		return;
	}
	var qr = r.qr;
	var qo = r.qo || 0;
	var qi = r.qi || 0;
	
	if((qr != undefined)) {

		// Deal with jog mode
		if(this.jog_command && (qo > 0)) {
			this.write(this.jog_command + '\n');
			return;
		}


		// This is complex and it still doesn't work as well as we'd like:
		this.send_rate -= qi;
		this.send_rate += qo;

		var lines_to_send = 0 ;
		if(this.flooded) {
			if(qr > 5) {
				if(this.send_rate < 0) {
					lines_to_send = qr-4;
				} else {
					lines_to_send = 0;
				}
			} else {
				lines_to_send = 1;
			}
		} else {
			lines_to_send = FLOOD_LEVEL;
			this.flooded = true;
		}

		if(lines_to_send > 0) {
			//console.log('qi: ' + qi + '  qr: ' + qr + '  qo: ' + qo + '   lines: ' + lines_to_send);
			var cmds = [];
			while(lines_to_send > 0) {
				if(this.gcode_queue.isEmpty()) {
					this.flooded = false;
					this.send_rate = 0;
					break;
				}
				cmds.push(this.gcode_queue.dequeue());
				lines_to_send -= 1;
			}
			if(cmds.length > 0) {
				cmds.push('\n');
				var outstring = cmds.join('\n');
				this.write(outstring);
			} 
			//console.log('    ' + cmds.join(' '));
		}
	}
}

G2.prototype.handleFooter = function(response) {
	if(response.f) {
		if(response.f[1] != 0) {
			var err_code = response.f[1];
			var err_msg = G2_ERRORS[err_code];
			this.emit('error', [err_code, err_msg[0], err_msg[1]]);
		}
	}
}

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
G2.prototype.handleStatusReport = function(response) {
	if(response.sr) {

		// Update our copy of the system status
		for (var key in response.sr) {
			this.status[key] = r.sr[key];
		}

		if(this.status.stat !== STAT_RUNNING) {
			//console.log('Checking for pending quit in the ' + state + ' state');
			if(this.quit_pending) {
				if(true/*response.sr['vel'] == 0*/) {
					setTimeout(function() {
						//console.log('executing flush');
						this.writeAndDrain('%%\nM30\n', function(error) {this.quit_lock = false;});
					}.bind(this), 15);
					this.quit_pending = false;
				}
				else {

				}
			}
		}

		// Alert subscribers of machine state changes
		if(this.prev_stat != this.status.stat) {
			this.emit('state', [this.prev_stat, this.status.stat]);
			this.prev_stat = this.status.stat;
		}

		// Emit status no matter what
		this.emit('status', this.status);
	}

}
// Called once a proper JSON response is decoded from the chunks of data that come back from G2
G2.prototype.onMessage = function(response) {
	
	// TODO more elegant way of dealing with "response" data.
	if(response.r) {
		this.emit('response', false, response.r);
		r = response.r;
	} else {
		r = response;
	}

	// Deal with streaming (if response contains a queue report)
	this.handleQueueReport(r);

	// Deal with footer
	this.handleFooter(response); 

	// Deal with G2 status
	this.handleStatusReport(r);
	//this.emit('status', r.sr);

	// Emitted everytime a message is received, regardless of content
	this.emit('message', response);
};

G2.prototype.feedHold = function(callback) {
	this.pause_flag = true;
	this.flooded = false;
	this.writeAndDrain('!\n', function(error) {});
}

G2.prototype.resume = function() {
	//console.log('Resume');
	if(this.pause_flag) {
		this.write('~\n'); //cycle start command character
		this.pause_flag = false;
		this.requestQueueReport();
	} else {
		//console.log('SKIPPING RESUME BECAUSE TOOL IS NOT PAUSED');
	}
}

G2.prototype.quit = function() {
	//console.log('Quit');
	this.gcode_queue.clear();
	if(this.pause_flag) {
		this.quit_lock = true;
		this.writeAndDrain('%%\n', function(error) {
			this.quit_lock = false;
		});
		this.pause_flag = false;
	} else {
		this.quit_lock = true;
		this.writeAndDrain('!\n', function(error) {
			setTimeout(function() {
				this.quit_lock = false;
			}.bind(this), 500);
			this.quit_pending = true; // This is a hack due to g2 issues #16
		}.bind(this)); 
		this.pause_flag = false;
	}
}


// Send a command to G2 (can be string or JSON)
G2.prototype.command = function(obj) {
	if((typeof obj) == 'string') {
		var cmd = obj.trim();
	} else {
		var cmd = JSON.stringify(obj);
	}
	this.write(cmd + '\n');
};

// Send a (possibly multi-line) string
// String will be stripped of comments and blank lines
// And only G-Codes and M-Codes will be sent to G2
// And an M30 will be placed at the end to put the machine back in a 'good' place
G2.prototype.runString = function(data) {
	lines = data.split('\n');
	for(var i=0; i<lines.length; i++) {
		line = lines[i].trim().toUpperCase();
		
		// Ignore comments
		if((line[0] == 'G') || (line[0] == 'M') || (line[0] == 'N')) {
			this.gcode_queue.enqueue(line);
		}
	}
	this.gcode_queue.enqueue("M30");
	this.pause_flag = false;
	this.requestQueueReport();
};




// export the class
exports.G2 = G2;

exports.STAT_INIT = STAT_INIT;
exports.STATE_READY = STATE_READY;
exports.STAT_ALARM = STAT_ALARM
exports.STAT_STOP = STAT_STOP;
exports.STAT_END = STAT_END;
exports.STAT_RUNNING = STAT_RUNNING;
exports.STAT_HOLDING = STAT_HOLDING;
exports.STAT_PROBE = STAT_PROBE;
exports.STAT_CYCLING = STAT_CYCLING;
exports.STAT_HOMING = STAT_HOMING;
