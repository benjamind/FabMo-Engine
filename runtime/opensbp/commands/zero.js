var log = require('../../../log').logger('sbp');
var g2 = require('../../../g2');
var sb3_commands = require('../sb3_commands');
var config = require('../../../config');

/* ZERO */

exports.ZX = function(args, callback) {
	this.machine.driver.get('mpox', function(err, value) {
		this.machine.driver.set('g55x',(value + this.machine.status.posz /*+ zoffset*/), function(err, value) {
			callback();
			this.cmd_posx = this.posx = 0;
		}.bind(this));
	}.bind(this));
};

exports.ZY = function(args, callback) {
	this.machine.driver.get('mpoy', function(err, value) {
		this.emit_gcode("G10 L2 P2 Y" + value);
	 	this.cmd_posy = this.posy = 0;
		callback();
	}.bind(this));
};

exports.ZZ = function(args, callback) {
	this.machine.driver.get('mpoz', function(err, value) {
		this.emit_gcode("G10 L2 P2 Z" + value);
	 	this.cmd_posz = this.posz = 0;
		callback();
	}.bind(this));
};

exports.ZA = function(args, callback) {
	this.machine.driver.get('mpoa', function(err, value) {
		this.emit_gcode("G10 L2 P2 A" + value);
	 	this.cmd_posa = this.posa = 0;
		callback();
	}.bind(this));	
};

exports.ZB = function(args, callback) {
	this.machine.driver.get('mpob', function(err, value) {
		this.emit_gcode("G10 L2 P2 B" + value);
	 	this.cmd_posb = this.posb = 0;
		callback();
	}.bind(this));	
};

exports.ZC = function(args, callback) {
	this.machine.driver.get('mpoc', function(err, value) {
		this.emit_gcode("G10 L2 P2 C" + value);
	 	this.cmd_posc = this.posc = 0.0;
		callback();
	}.bind(this));	
};

exports.Z2 = function(args, callback)  {
	this.machine.driver.get('mpox', function(err, value1) {
		this.machine.driver.get('mpoy', function(err, value2) {
		    this.emit_gcode("G10 L2 P2 X" + value1 + "Y" + value2);
			this.cmd_posx = this.posx = 0.0;
			this.cmd_posy = this.posy = 0.0;
			callback();
		}.bind(this));
	}.bind(this));
};

exports.Z3 = function(args) {
	this.emit_gcode("G10 L2 P2 X" + this.posx + " Y" + this.posy + " Z" + this.posz);
	this.cmd_posx = this.posx = 0.0;
	this.cmd_posy = this.posy = 0.0;
	this.cmd_posz = this.posz = 0.0;
};

exports.Z4 = function(args) {
	this.emit_gcode("G10 L2 P2 X" + this.posx + " Y" + this.posy + " Z" + this.posz + " A" + this.posa);
	this.cmd_posx = this.posx = 0.0;
	this.cmd_posy = this.posy = 0.0;
	this.cmd_posz = this.posz = 0.0;
 	this.cmd_posa = this.posa = 0.0;
};

exports.Z5 = function(args) {
	this.emit_gcode("G10 L2 P2 X" + this.posx + " Y" + this.posy + " Z" + this.posz + " A" + this.posa + " B" + this.posb);
	this.cmd_posx = this.posx = 0.0;
	this.cmd_posy = this.posy = 0.0;
	this.cmd_posz = this.posz = 0.0;
 	this.cmd_posa = this.posa = 0.0;
 	this.cmd_posb = this.posb = 0.0;
};

exports.Z6 = function(args) {
	this.emit_gcode("G10 L2 P2 X" + this.posx + " Y" + this.posy + " Z" + this.posz + " A" + this.posa + " B" + this.posb + " C" + this.posc);
 	this.cmd_posx = this.posx = 0.0;
	this.cmd_posy = this.posy = 0.0;
	this.cmd_posz = this.posz = 0.0;
 	this.cmd_posa = this.posa = 0.0;
 	this.cmd_posb = this.posb = 0.0;
 	this.cmd_posc = this.posc = 0.0;
};

exports.ZT = function(args) {
    this.emit_gcode("G54");
};