async = require('async');
util = require('util');
Config = require('./config').Config;

// A TinyGConfig is the configuration object that stores the configuration values for TinyG.
// TinyG configuration data is *already* JSON formatted, so TinyGConfig objects are easy to create from config files using `load()`
// A TinyGConfig object is bound to a driver, which gets updated when configuration values are loaded/changed.
TinyGConfig = function(driver) {
	Config.call(this, 'tinyg');
	this.driver = driver;
};
util.inherits(TinyGConfig, Config);

TinyGConfig.prototype.changeUnits = function(units, callback) {
	this.driver.setUnits(units, function(err, data) {
		if(err) { 
			callback(err); 
		} else {
			this.getFromDriver(function(err, tinyg_values) {
				if(err) { 
					callback(err); 
				} else  {
					this.update(tinyg_values, callback);
				}
			}.bind(this));			
		}
	}.bind(this));
}

TinyGConfig.prototype.getFromDriver = function(callback) {
	var keys = Object.keys(this._cache)
	this.driver.get(Object.keys(this._cache), function(err, values) {
		if(err) {
			callback(err);
		} else {
			if(keys.length != values.length) {
				callback(new Error("Something went wrong when getting values from TinyG"))
			} else {
				var obj = {}
				for(var i=0; i<keys.length; i++) {
					obj[keys[i]] = values[i];
				}
				callback(null, obj);
			}
		}

	});
}

// Update the configuration with the data provided (data is just an object with configuration keys/values)
TinyGConfig.prototype.update = function(data, callback) {
	keys = Object.keys(data);
	// TODO: We can probably replace this with a `setMany()`
	async.mapSeries(
		keys, 
		// Call driver.set() for each item in the collection of data that was passed in.
		function iterator(key, cb) {
			if(this.driver) {
				this.driver.set(key, data[key], cb);
			} else {
				cb(null);
			}
		}.bind(this),
		// Update the cache with all the values returned from the hardware
		function done(err, results) {
			if(err) { return callback(err); }
			var retval = {};
			for(var i=0; i<keys.length; i++) {
				key = keys[i];
				value = results[i];
				this._cache[key] = value;
				retval[key] = value;
			}

			this.save(function(err, result) {
				if(err) {
					callback(err);
				} else {
					callback(null, retval);
				}
			}.bind(this));
		}.bind(this)
	);
};

// setMany aliases to update, to provide similar interface as TinyG driver
TinyGConfig.prototype.setMany = TinyGConfig.prototype.update;

// Status reports are special, and their format must be whats expected for the machine/runtime environments
// to work properly.  
// TODO: Move this data out into a configuration file, perhaps.
TinyGConfig.prototype.configureStatusReports = function(callback) {
	if(this.driver) {
		this.driver.command({"sr":{
						"posx":true, 
						"posy":true, 
						"posz":true, 
						"posa":true, 
						"posb":true, 
						"vel":true, 
						"stat":true, 
						"hold":true, 
						"line":true, 
						"coor":true,
						"unit":true
					}});
		this.driver.command({"qv":0});
		this.driver.command({"jv":4});
		this.driver.requestStatusReport();
		return callback(null, this);
	} else {
		return callback(null, this);
	}
};
exports.TinyGConfig = TinyGConfig;
