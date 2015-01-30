var restify = require('restify');
var async = require('async');
var process = require('process');
var machine = require('./machine');
var detection_daemon = require('./detection_daemon');
var config = require('./config');
var PLATFORM = process.platform;
var log = require('./log').logger('engine');
var db = require('./db');
var dashboard = require('./dashboard');

var Engine = function() {
};

Engine.prototype.stop = function(callback) {
    this.machine.disconnect();
};

Engine.prototype.start = function(callback) {

    async.series([

        // Configure the engine data directories
        function setup_application(callback) {
            log.info('Checking engine data directory tree...');
            config.createDataDirectories(callback);
        },

        // Load the engine configuration from disk
        function load_engine_config(callback) {
            log.info("Loading engine configuration...");
            config.configureEngine(callback);
        },

        // "Apply" the engine configuration, that is, take the configuration values loaded and actually
        // set up the application based on them.
        function apply_engine_config(callback) {
            log.info("Applying engine configuration...");
            config.engine.apply(callback);
        },

        // Configure the DB
        function setup_database(callback) {
            db.configureDB(callback);
        },

        // Connect to G2 and initialize machine runtimes
        function connect(callback) {
            log.info("Connecting to G2...");
            machine.connect(function(err, machine) {
                if(err) {
                    log.error("!!!!!!!!!!!!!!!!!!!!!!!!");
                    log.error("Could not connect to G2.");
                    log.error("(" + err + ")");
                    log.error("!!!!!!!!!!!!!!!!!!!!!!!!");
                }
                setImmediate(callback, null);
            });
        }.bind(this),

        // Configure G2 by loading all its json settings and static configuration parameters
        function load_driver_config(callback) {
            this.machine = machine.machine;
            if(this.machine.isConnected()) {
                log.info("Configuring G2...");
                config.configureDriver(machine.machine.driver, function(err, data) {
                    if(err) {
                        log.error("There were problems loading the G2 configuration.");
                    }
                    callback(null);
                });
            } else {
                log.warn("Skipping G2 configuration due to no connection.");
                setImmediate(callback, null);
            }
        }.bind(this),

        function get_g2_version(callback) {
            log.info("Getting G2 firmware version...");
            if(this.machine.isConnected()) {
                this.machine.driver.get('fb', function(err, value) {
                    if(err) {
                        log.error('Could not get the G2 firmware build. (' + err + ')');
                    } else {
                        log.info('G2 Firmware Build: ' + value);
                    }
                    callback(null);
                });
            } else {
                setImmediate(callback, null);
            }
    	}.bind(this),

        function load_opensbp_commands(callback) {
            log.info("Loading OpenSBP Commands...");
            this.machine.sbp_runtime.loadCommands(callback);
        }.bind(this),

        function load_opensbp_config(callback) {
            log.info("Configuring OpenSBP runtime...");
            config.configureOpenSBP(callback);
        },

        function configure_dashboard(callback) {
            log.info("Configuring dashboard...");
            dashboard.configure(callback);
        },

        function load_apps(callback) {
            log.info("Loading dashboard apps...");
            dashboard.loadApps(function(err, result) {
                callback(null, result);
            });
        },

        // Kick off the server if all of the above went OK.
        function start_server(callback) {
            log.info("Setting up the webserver...");
            var server = restify.createServer({name:"FabMo Engine"});
            this.server = server;

            // Allow JSON over Cross-origin resource sharing 
            log.info("Configuring cross-origin requests...");
            server.use(
                function crossOrigin(req,res,next){
                    res.header("Access-Control-Allow-Origin", "*");
                    res.header("Access-Control-Allow-Headers", "X-Requested-With");
                    return next();
                }
            );

            // Configure local directory for uploading files
            log.info("Cofiguring upload directory...");
            server.use(restify.bodyParser({'uploadDir':config.engine.get('upload_dir')}));
            server.pre(restify.pre.sanitizePath());

            // Import the routes module and apply the routes to the server
            log.info("Loading routes...");
            var routes = require('./routes')(server);

            // Kick off the server listening for connections
            server.listen(config.engine.get('server_port'), function() {
                log.info(server.name+ ' listening at '+ server.url);
                callback(null, server);
            });
        }.bind(this),
        
        ],

        function(err, results) {
            if(err) {
                log.error(err);
                typeof callback === 'function' && callback(err);
            } else {
                typeof callback === 'function' && callback(null, this);
            }
        }.bind(this)
    );
};

exports.Engine = Engine;
