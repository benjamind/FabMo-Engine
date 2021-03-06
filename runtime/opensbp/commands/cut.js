var log = require('../../../log').logger('sbp');
var g2 = require('../../../g2');
var sb3_commands = require('../sb3_commands');
var config = require('../../../config');

/* CUTS */

exports.CA = function(args) {
  var startX = this.cmd_posx;
  var startY = this.cmd_posy;
  var startZ = this.cmd_posz;
  var len = args[0] !== undefined ? Math.abs(args[0]) : undefined;
  var ht  = args[1] !== undefined ? Math.abs(args[1]) : undefined;
  var inStr = args[2] !== undefined ? args[2].toUpperCase() : 'T';
  var OIT = (inStr === 'O' || inStr === 'I' || inStr === 'T') ? inStr : 'T';
  var Dir = args[3] !== undefined ? args[3] : 1;
  var angle = args[4] !== undefined ? args[4] : undefined;
  var Plg  = args[5] !== undefined ? args[5] : undefined;
  var reps = args[6] !== undefined ? args[6] : 1; 
  var propX = args[7] !== undefined ? args[7] : 1;
  var propY = args[8] !== undefined ? args[8] : 1;
  var tabs = args[9] !== undefined ? args[9] : undefined;
  var noPullUp = args[10] !== undefined ? [10] : 0;
  var plgFromZero = args[11] !== undefined ? args[11] : 0;
  var comp = 0;

  if (OIT === 'O') {
    comp = 1;
  } 
  else if (OIT === 'I') {
    comp = -1;
  }

  var radius = (ht/2) + ((len*len) / (8*ht)) + (config.opensbp.get('cutterDia')/2 * comp);

  if ( radius === undefined || radius <= 0 ){
    throw( "Zero radius circle: CA" );
  }

  var xOffset = startX + (len/2);
  var yOffset = startY + (ht - radius);

  var endX = startX + len;
  var endY = startY;

  if (Dir === -1) {
    xOffset *= (-1);
    endX = startX - len;
  }

  this.CG([undefined,endX,endY,xOffset,yOffset,OIT,Dir,Plg,reps,propX,propY,undefined,noPullUp,plgFromZero]);

};

exports.CC = function(args) {
  var startX = this.cmd_posx;
  var startY = this.cmd_posy;
  var startZ = this.cmd_posz;
  var Dia = args[0] !== undefined ? args[0] : undefined;
  var inStr = args[1] !== undefined ? args[1].toUpperCase() : 'T';
  var OIT = (inStr === 'O' || inStr === 'I' || inStr === 'T') ? inStr : 'T';
  var Dir = args[2] !== undefined ? args[2] : 1;
  var Bang = args[3] !== undefined ? args[3] : 0;
  var Eang = args[4] !== undefined ? args[4] : 0;
  var Plg = args[5] !== undefined ? args[5] : undefined; 
  var reps = args[6] !== undefined ? args[6] : undefined;
  var propX = args[7] !== undefined ? args[7] : undefined;
  var propY = args[8] !== undefined ? args[8] : undefined;
  var optCC = args[9] !== undefined ? args[9] : undefined;
  var noPullUp = args[10] !== undefined ? args[10] : undefined;
  var plgFromZero = args[11] !== undefined ? args[11] : undefined;
  var comp = 0;

  if (OIT === 'O') {
    comp = 1;
  } 
  else if (OIT === 'I') {
    comp = -1;
  }
  if ( Dia === undefined || Dia <= 0 ){
    // Error: Zero diameter circle
    throw( "Zero Diameter Circle: CC" ); 
  }

  var WBang = 450 - Bang;
  if ( WBang > 360 || WBang === 360 ) { 
    WBang -= 360;
  } 
  else if ( WBang < -360 || WBang === -360 ) {
    WBang += 360;
  }
  var Bradians = WBang*0.01745329252;

  var WEang = 450 - Eang;
  if ( WEang > 360 || WEang === 360 ) { 
    WEang -= 360;
  }
  else if ( WEang < -360 || WEang === -360 ) {
    WEang += 360;
  }
  var Eradians = WEang*0.01745329252;

  // Find Center offset
  var radius = Dia/2 + (config.opensbp.get('cutterDia')/2 * comp);
  var centerX = startX + (radius * Math.cos(Bradians + Math.PI));
  var centerY = startY + (radius * Math.sin(Bradians + Math.PI));
  var xOffset = centerX - startX;
  var yOffset = centerY - startY;
  var endX;
  var endY;

  // Find End point
  if ( Bang === Eang ){
    endX = startX;
    endY = startY;
  }
  else {
    endX = centerX + radius * Math.cos(Eradians);
    endY = centerY + radius * Math.sin(Eradians);
  }

  this.CG([undefined,endX,endY,xOffset,yOffset,OIT,Dir,Plg,reps,propX,propY,optCC,noPullUp,plgFromZero]);

};

exports.CP = function(args) {
  var startZ = this.cmd_posz;
  var Dia = args[0] !== undefined ? args[0] : undefined;
  var centerX = args[1] !== undefined ? args[1] : this.cmd_posx;
  var centerY = args[2] !== undefined ? args[2] : this.cmd_posy;
  var inStr = args[3] !== undefined ? args[3].toUpperCase() : 'T';
  var OIT = (inStr === 'O' || inStr === 'I' || inStr === 'T') ? inStr : 'T';
  var Dir = args[4] !== undefined ? args[4] : 1;
  var Bang = args[5] !== undefined ? args[5] : 0; 
  var Eang = args[6] !== undefined ? args[6] : 0;
  var Plg = args[7] !== undefined ? args[7] : undefined;
  var reps = args[8] !== undefined ? args[8] : undefined;
  var propX = args[9] !== undefined ? args[9] : undefined;
  var propY = args[10] !== undefined ? args[10] : undefined;
  var optCP = args[11] !== undefined ? args[11] : undefined;
  var noPullUp = args[12] !== undefined ? args[12] : undefined;
  var plgFromZero = args[13] !== undefined ? args[13] : undefined;
  var currentZ = startZ;
  var res = 5;
  var comp = 0;
  var feedrate = 0;

  if (OIT === 'O') {
    comp = 1;
  } 
  else if (OIT === 'I') {
    comp = -1;
  }

  if ( Dia === undefined || Dia <= 0 ){
    throw( "Zero diameter circle: CC" );
  }
  var WBang = 450 - Bang;
  if ( WBang > 360 || WBang === 360 ) { 
    WBang -= 360;
  } 
  else if ( WBang < -360 || WBang === -360 ) {
    WBang += 360;
  }
  var Bradians = WBang*0.01745329252;

  var WEang = 450 - Eang;
  if ( WEang > 360 || WEang === 360 ) {
    WEang -= 360;
  }
  else if ( WEang < -360 || WEang === -360 ) {
    WEang += 360;
  }
  var Eradians = WEang*0.01745329252;

  // Find Center offset
  var radius = Dia/2 + (config.opensbp.get('cutterDia')/2 * comp);
  var startX = centerX + (radius * Math.cos(Bradians));
  var startY = centerY + (radius * Math.sin(Bradians));
  var xOffset = centerX - startX;
  var yOffset = centerY - startY;

  // Find End point
  var endX = centerX + radius * Math.cos(Eradians);
  var endY = centerY + radius * Math.sin(Eradians);

  if( this.cmd_posx !== startX && this.cmd_posy !== startY ){
      feedrate = this.movespeed_xy * 60;
      var safeZ = config.opensbp.get('safeZpullUp');
      if( currentZ !== safeZ ){
        this.emit_move('G1',{'X':startX,'Y':startY,'Z':startZ,'F':feedrate});
        this.cmd_posz = safeZ;
      }
      this.emit_move('G0',{'X':startX,'Y':startY});
      this.cmd_posx = startX;
      this.cmd_posy = startY;
  }

  this.CG([undefined,endX,endY,xOffset,yOffset,OIT,Dir,Plg,reps,propX,propY,optCP,noPullUp,plgFromZero]);

};


//	The CG command will cut a circle. This command closely resembles a G-code circle (G02 or G03)
//		Though, this command has several added features that its G-code counterparts don't:
//			- Spiral plunge with multiple passes
//			- Pocketing
//			- Pocketing with multiple passes
//		Can also be used for Arcs and Arcs with multiple passes
//		
//	Usage: CG,<no used>,<X End>,<Y End>,<X Center>,<Y Center>,<I-O-T>,<Direction>,<Plunge Depth>,
//			  <Repetitions>,<>,<>,<Options-2=Pocket,3=Spiral Plunge,4=Spiral Plunge with Bottom pass>,
//			  <No Pull Up after cut>,<Plunge from Z zero>
//	
exports.CG = function(args) {
//  log.debug("CG-args = " + args);
  var startX = this.cmd_posx;
  var startY = this.cmd_posy;
  var startZ = this.cmd_posz;
  var endX = args[1] !== undefined ? args[1] : undefined;
  var endY = args[2] !== undefined ? args[2] : undefined;
  var centerX = args[3] !== undefined ? args[3] : undefined;
  var centerY = args[4] !== undefined ? args[4] : undefined;
  var inStr = args[5] !== undefined ? args[5].toUpperCase() : 'T';
  var OIT = (inStr === 'O' || inStr === 'I' || inStr === 'T') ? inStr : 'T';
  var Dir = args[6] !== undefined ? args[6] : 1; 
  var Plg = args[7] !== undefined ? args[7] : 0;
  var reps = args[8] !== undefined ? args[8] : 1;
  var propX = args[9] !== undefined ? args[9] : 1;
  var propY = args[10] !== undefined ? args[10] : 1;
  var optCG = args[11] !== undefined ? args[11] : 0;
  var noPullUp = args[12] !== undefined ? args[12] : 0;
  var plgFromZero = args[13] !== undefined ? args[13] : 0;
  var feedrateXY = this.movespeed_xy * 60;
  var feedrateZ = this.movespeed_z * 60;
	var currentZ;
	var outStr;
  var tolerance = 0.000001;

  log.debug("start X:" + startX );
  log.debug("start Y:" + startY );
  log.debug("start Z:" + startZ );
  log.debug("end X:" + endX );
  log.debug("end Y:" + endY );
  log.debug("center X:" + centerX );
  log.debug("center Y:" + centerY );
  log.debug("I-O-T:" + OIT );
  log.debug("Dir:" + Dir );

  if ( centerX === 0 && centerY === 0 ){
    throw( "Zero diameter circle: CG" );
  }

  if ((propX < 0 && propY > 0) || (propX > 0 && propY < 0 )) { 
    Dir *= (-1);
  }
  if (propX === propY){
    if (propX !== 1 || propY !== 1) {
      endX = startX + (centerX * Math.abs(propX)) + ((endX - (startX + centerX)) * Math.abs(propX));
      endY = startY + (centerY * Math.abs(propY)) + ((endY - (startX + centerY)) * Math.abs(propY));
      centerX *= Math.abs(propX);
      centerY *= Math.abs(propY);
      if (propX < 0) { 
        endX = startX + (startX-endX);
        centerX *= (-1); 
      }
      if (propY < 0) { 
        endY = startY + (startY-endY);
        centerY *= (-1); 
      }
    }
  }
  
  if (Plg !== 0 && plgFromZero == 1){ currentZ = 0; }
  else { currentZ = startZ; }
  var safeZCG = currentZ + config.opensbp.get('safeZpullUp');
  var spiralPlunge = (optCG === 2 || optCG === 4) ? 1 : 0;

  if ( optCG == 2 ) {
  	circRadius = Math.sqrt((centerX * centerX) + (centerY * centerY));
  	PocketAngle = Math.atan2(centerY, centerX);								// Find the angle of the step over between passes
  	stepOver = config.opensbp.get('cutterDia') * ((100 - config.opensbp.get('pocketOverlap')) / 100);	// Calculate the overlap
  	Pocket_StepX = stepOver * Math.cos(PocketAngle);						// Calculate the stepover in X based on the radius of the cutter * overlap
  	Pocket_StepY = stepOver * Math.sin(PocketAngle);						// Calculate the stepover in Y based on the radius of the cutter * overlap
  }

  if ( plgFromZero == 1 ) {										// If plunge depth is specified move to that depth * number of reps
    this.emit_move('G1',{ 'Z':currentZ, 'F':feedrateZ });
  }

  var nextX = 0;
  var nextY = 0;

  for (i=0; i<reps;i++){
  	if (Plg !== 0 && optCG < 3 ) {										// If plunge depth is specified move to that depth * number of reps
  		currentZ += Plg;
      this.emit_move('G1',{ 'Z':currentZ, 'F':feedrateZ });
   	}  
   	if (optCG === 2) { 															// Pocket circle from the outside inward to center
   		// Loop passes until overlapping the center
   		for (j=0; (Math.abs(Pocket_StepX * j) < circRadius) && (Math.abs(Pocket_StepY * j) < circRadius) ; j++){
        nextX = (startX + (j*Pocket_StepX));
        nextY = (startY + (j*Pocket_StepY));
        if ( j > 0 ) {
    	   	this.emit_move('G1',{ 'X':nextX, 'Y':nextY, 'F':feedrateXY });
        }
        if ( Math.abs(propX) !== Math.abs(propY) ) {      // calculate an interpolated ellipse
          this.interpolate_circle(startX,startY,startZ,
                                  endX,endY,Plg,
                                  centerX,centerY,
                                  propX,propY,
                                  optCG );
        } 
  	   	else {
          if ( Dir === 1 ) { outStr = 'G2'; }	  // Clockwise circle/arc
   			  else { outStr = 'G3'; }	              // CounterClockwise circle/arc
            this.emit_move(outStr,{ 'X':nextX,
                                    'I':(centerX - (j*Pocket_StepX)),
                                    'J':(centerY - (j*Pocket_StepY)),
                                    'F':feedrateXY });
        }										
    	}
    	this.emit_move('G0',{'Z':safeZCG});
      this.emit_move('G0',{ 'X':startX, 'Y':startY });
    } 
    else {
      if ( Math.abs(propX) !== Math.abs(propY) ) {      // calculate out to an interpolated ellipse
//        this.interpolate_circle(startX,startY,currentZ,endX,endY,Plg,centerX,centerY,propX,propY);
//        circleInterpolate(runtime, code, CGParams);
      }
    	else {
        var emitObj = {};
        
        if (Dir === 1 ) { 
          outStr = 'G2';
        }	// Clockwise circle/arc
        else { 
          outStr = 'G3';
        }			// CounterClockwise circle/arc
        
        if (parseInt(startX * 100000) !== parseInt(endX * 100000)) {
          emitObj.X = endX;
        }
        if (parseInt(startY * 100000) !== parseInt(endY * 100000)) {
          emitObj.Y = endY;
        }

		    emitObj.I = centerX;
        emitObj.J = centerY;
        if (Plg !== 0 && optCG === 3 ) { 
          emitObj.Z = (currentZ + Plg); 
          currentZ += Plg;
        } // Add Z for spiral plunge
        emitObj.F = feedrateZ;
        this.emit_move(outStr,emitObj); 
	    	
        if( i+1 < reps && ( endX != startX || endY != startY ) ){					//If an arc, pullup and jog back to the start position
          this.emit_move('G0',{'Z':safeZCG});
          this.emit_move('G0',{ 'X':startX, 'Y':startY });
        }
		  }
    }
  }

  if (optCG === 4 ) { // Add bottom circle if spiral with bottom clr is specified
    if( endX != startX || endY != startY ) {	//If an arc, pullup and jog back to the start position
      this.emit_move('G0',{'Z':safeZCG});
      this.emit_move('G0',{ 'X':startX, 'Y':startY });
      this.emit_move('G1',{ 'Z':currentZ, 'F':feedrateZ });
    }
    if ( Math.abs(propX) !== Math.abs(propY) ) {      // calculate out to an interpolated ellipse

    }
    else {
      if (Dir === 1 ){ outStr = "G2"; } 		// Clockwise circle/arc
      else { outStr = "G3"; }					// CounterClockwise circle/arc
        this.emit_move(outStr,{ 'X':(startX + (j*Pocket_StepX)),
                                'Y':(startY + (j*Pocket_StepY)),
                                'I':(centerX - (j*Pocket_StepX)),
                                'J':(centerY - (j*Pocket_StepY)),
                                'F':feedrateXY });
    }
  }

  if( noPullUp === 0 && currentZ != startZ){    	//If No pull-up is set to YES, pull up to the starting Z location
    this.emit_move('G0',{'Z':startZ});
  }

};

//  Interpolate_Circle - is used to interpolate a circle that has uneven proportions as an ellipse.
//    
//
//  Usage: interpolate_circle(<startX>,<startY>,<startZ>,<endX>,<endY>,<plunge>,
//                            <centerX>,<centerY>,<propX>,<propY>);
exports.interpolate_circle = function(startX,startY,startZ,endX,endY,plunge,centerX,centerY,propX,propY,opt) {

  var nextX = startX;
  var nextY = startY;
  var nextZ = startZ;
 
  var SpiralPlunge = 0;
  if ( plunge !== 0 ) { SpiralPlunge = 1; }

  centerX *= propX;
  centerY *= propY;

  var radius = Math.sqrt(Math.pow((centerX),2)+Math.pow((centerY),2));

  // Find the beginning and ending angles in radians. We'll use only radians from here on.
  var Bang = Math.atan2(centerX, centerY);
  var Eang = Math.atan2((endX*propX)-(startX-centerX), (endY*propY)-(startY-centerY));
  var inclAng = 0.0;

  if (Dir === 1) {
    if (Bang < Eang) { inclAng = Eang - Bang; }
    if (Bang > Eang) { inclAng = 6.28318530717959 - Bang + Eang; }
  }
  else {
    if (Bang < Eang) { inclAng = 6.28318530717959 - Bang + Eang; }
    if (Bang > Eang) { inclAng = Eang - Bang; }
  }

  if ( inclAng < 0.00001 ) { 
    // end here  
  }

  var incrAng = 0.05;
  var Xfactor1 = radius * propX;
  var Yfactor1 = radius * propY;

  if (incrAng > inclAng) { incrAng = inclAng; }

  nextX = Xfactor1 * (Math.sin(Bang + (incrAng * Dir))) + Xfactor1;
  nextY = Yfactor1 * (Math.cos(Bang + (incrAng * Dir))) + Yfactor1;

  var incrDist = Math.sqrt(Math.pow((nextX-startX),2)+Math.pow((nextY-startY),2));
  var circRes = config.opensbp.get('cRes');
  
  if (incrDist > circRes) { 
    incrDist = circRes; 
  }

  var FirstCircleX = radius * Math.sin(t) * propX;
  var FirstCricleY = radius * Math.cos(t) * propY;

  nextX = Xfactor1 * (Math.sin(Bang + (increment * Dir))) + Xfactor2;
  nextY = Yfactor1 * (Math.cos(Bang + (increment * Dir))) + Yfactor2;

  var DistA = nextX - startX;
  var DistB = nextY - startY;
  
  FirstDist = Math.sqrt(Math.pow(DistA,2) + Math.pow(DistB,2));

  if ( FirstDist === 0 ) {
    if ( incrDist === 0 ) { increment = 0.01;}
    incrDist *= config.opensbp.get('cRes') / FirstDist;

    incrZ = Plg/steps;
  }

  // Calculate the next Z position
    nextX = Xfactor1 * (Math.sin(t + (increment * Dir))) + Xfactor1;
    nextY = Yfactor1 * (Math.cos(t + (increment * Dir))) + Yfactor1;

//  log.debug( " Interpolate - Next Point: " + JSON.stringify(args));
  var feedrate = this.movespeed_xy * 60;
  this.emit_move('G1',{"X":x,"Y":y,"Z":z, 'F':feedrate});

};

//	The CR command will cut a rectangle. It will generate the necessary G-code to profile and
//		pocket a rectangle. The features include:
//			- Spiral plunge with multiple passes
//			- Pocketing
//			- Pocketing with multiple passes
//			- Rotation around the starting point
//		
//	Usage: CR,<X Length>,<Y Length>,<I-O-T>,<Direction>,<Plunge Depth>,<Repetitions>,
//			  <Options-2=Pocket OUT-IN,3=Pocket IN-OUT>,<Plunge from Z zero>,<Angle of Rotation>,
//			  <Sprial Plunge>
//	
exports.CR = function(args) {
	//calc and output commands to cut a rectangle
  var n = 0.0;
	var startX = this.cmd_posx;
  var startY = this.cmd_posy;
  var startZ = this.cmd_posz;
  var pckt_startX = startX;
  var pckt_startY = startY;
  var currentZ = startZ;
  var rotPtX = 0.0;
  var rotPtY = 0.0;
  var xDir = 1;
  var yDir = 1;

  var lenX = args[0] !== undefined ? args[0] : undefined; 	// X length
  var lenY = args[1] !== undefined ? args[1] : undefined;		// Y length
  var inStr = args[2] !== undefined ? args[2].toUpperCase() : "T";
  var OIT = (inStr === "O" || inStr === "I" || inStr === "T") ? inStr : "T"; // Cutter compentsation (I=inside, T=no comp, O=outside)
  var Dir = args[3] !== undefined ? args[3] : 1; 				// Direction of cut (-1=CCW, 1=CW)
  var stCorner = args[4] !== undefined ? args[4] : 4;			// Start Corner - default is 4, the bottom left corner. 0=Center
  var Plg = args[5] !== undefined ? args[5] : 0.0;			// Plunge depth per repetion
  var reps = args[6] !== undefined ? args[6] : 1;				// Repetions
  var optCR = args[7] !== undefined ? args[7] : 0;			// Options - 1-Tab, 2-Pocket Outside-In, 3-Pocket Inside-Out
  var plgFromZero = args[8] !== undefined ? args[8] : 0;		// Start Plunge from Zero <0-NO, 1-YES>
  var RotationAngle = args[9] !== undefined ? args[9] : 0.0;	// Angle to rotate rectangle around starting point
  var PlgAxis = args[10] !== undefined ? args[10] : 'Z';		// Axis to plunge <Z or A>
	var spiralPlg = args[11] !== undefined ? args[11] : 0;		// Turn spiral plunge ON for first pass (0=OFF, 1=ON)

	var PlgSp = 0.0;
	var noPullUp = 0;
	var cosRA = 0.0;
	var sinRA = 0.0;
  var stepOver = 0.0;
  var pckt_offsetX = 0.0;
  var pckt_offsetY = 0.0;    
  var order = [1,2,3,4];
  var pckt_stepX = 0.0;
  var pckt_stepY = 0.0;
  var steps = 1.0;

  var feedrateXY = this.movespeed_xy * 60;
  var feedrateZ = this.movespeed_xy * 60;

  if (RotationAngle !== 0 ) { 
   	RotationAngle *= 0.01745329252;							// Convert rotation angle in degrees to radians
   	cosRA = Math.cos(RotationAngle);						// Calculate the Cosine of the rotation angle
   	sinRA = Math.sin(RotationAngle);						// Calculate the Sine of the rotation angle
   	rotPtX = pckt_startX; 									// Rotation point X
   	rotPtY = pckt_startY;									// Rotation point Y
  }
    
  if (Plg !== 0 && plgFromZero === 1){ currentZ = 0; }
  else{ currentZ = startZ; }
  var safeZCG = currentZ + config.opensbp.get('safeZpullUp');

  // Set Order and directions based on starting corner
  if ( stCorner == 1 ) { 
  	yDir = -1;
   	if ( Dir == -1 ) { 
   		order = [3,2,1,4]; 
   	}
  }	
  else if ( stCorner == 2 ) {
   	xDir = -1;
   	yDir = -1;
   	if ( Dir == 1 ) { 
   		order = [3,2,1,4]; 
   	}
  }
  else if ( stCorner == 3 ) { 
   	xDir = -1; 
   	if ( Dir == -1 ) {
   		order = [3,2,1,4]; 
   	}
  }
  else { 
   	if ( Dir == 1 ) {
   		order = [3,2,1,4]; 
   	}
  }

  if ( OIT == "O" ) { 
   	lenX += config.opensbp.get('cutterDia') * xDir;
   	lenY += config.opensbp.get('cutterDia') * yDir;
  }
  else if ( OIT == "I" ) {
   	lenX -= config.opensbp.get('cutterDia') * xDir;
   	lenY -= config.opensbp.get('cutterDia') * yDir;
  }
  else {
   	lenX *= xDir;
   	lenY *= yDir;
  }

  if ( stCorner === 0 ) {
  	pckt_startX = startX - (lenX/2);
  	pckt_startY = startY - (lenY/2);    		
  }

	// If a pocket, calculate the step over and number of steps to pocket out the complete rectangle.
  if (optCR > 1) {
   	stepOver = config.opensbp.get('cutterDia') * ((100 - config.opensbp.get('pocketOverlap')) / 100);	// Calculate the overlap
   	pckt_stepX = pckt_stepY = stepOver;
  	pckt_stepX *= xDir;
  	pckt_stepY *= yDir;
   	// Base the numvber of steps on the short side of the rectangle.
	 	if ( Math.abs(lenX) < Math.abs(lenY) ) {
	 		steps = Math.floor((Math.abs(lenX)/2)/Math.abs(stepOver)) + 1; 
	 	}
	 	else {	// If a square or the X is shorter, use the X length.
	 		steps = Math.floor((Math.abs(lenY)/2)/Math.abs(stepOver)) + 1; 
	 	}   		
	  // If an inside-out pocket, reverse the step over direction and find the pocket start point near the center
    if ( optCR === 3 ) {
      pckt_stepX *= (-1);
      pckt_stepY *= (-1);
      pckt_offsetX = stepOver * (steps - 1) * xDir;
      pckt_offsetY = stepOver * (steps - 1) * yDir;

      nextX = pckt_startX + pckt_offsetX;
      nextY = pckt_startY + pckt_offsetY;

      if ( RotationAngle === 0.0 ) { 
		    outStr = "G0X" + nextX + "Y" + nextY;
      }
      else {
		    outStr = "G0X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
			    		   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
      }
      this.emit_gcode( outStr);
    }
  }

  // If an inside-out pocket, move to the start point of the pocket
  if ( optCR == 3 || stCorner === 0 ) {
    this.emit_gcode( "G0Z" + safeZCG );

    nextX = pckt_startX + pckt_offsetX;
    nextY = pckt_startY + pckt_offsetY;

		if ( RotationAngle === 0.0 ) { 
			outStr = "G1X" + nextX + "Y" + nextY;
		}
		else {
			outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
						   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
		}
    this.emit_gcode( "G1Z" + startZ + "F" + feedrateZ );
    this.emit_gcode( outStr );
  }

  for (i = 0; i < reps; i++) {  
   	if ( spiralPlg != 1 ) {								// If plunge depth is specified move to that depth * number of reps
    	currentZ += Plg;
    	this.emit_gcode( "G1Z" + currentZ + "F" + feedrateZ );    		
    }
    else {
    	this.emit_gcode( "G1Z" + currentZ + "F" + feedrateZ );    		
    }
    	
    pass = cnt = 0;
    var nextX = 0.0;
    var nextY = 0.0;

    for ( j = 0; j < steps; j++ ){
   		do {
	   		for ( k=0; k<4; k++ ){
	   			n = order[k];
	   			switch (n){
	   				case 1:
    				  nextX = (pckt_startX + lenX - pckt_offsetX) - (pckt_stepX * j);
    					nextY = (pckt_startY + pckt_offsetY) + (pckt_stepY * j);
    						
    					if ( RotationAngle === 0.0 ) { 
    						outStr = "G1X" + nextX + "Y" + nextY;
    					}
    					else {
    						outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
    									   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
    					}
    						
    					if ( spiralPlg == 1 && pass === 0 ) {
    						PlgSp = currentZ + (Plg * 0.25); 
    						outStr += "Z" + (PlgSp).toFixed(4);
    					}
    						
    					outStr += "F" + feedrateXY;
    					this.emit_gcode (outStr);
    				break;

    				case 2:
   						nextX = (pckt_startX + lenX - pckt_offsetX) - (pckt_stepX * j);
   						nextY = (pckt_startY + lenY - pckt_offsetY) - (pckt_stepY * j);

    					if ( RotationAngle === 0.0 ) { 
    						outStr = "G1X" + nextX + "Y" + nextY;
    					}	
   						else {
   							outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
   										   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
   						}

   						if ( spiralPlg === 1 && pass === 0 ) { 
   							PlgSp = currentZ + (Plg * 0.5);	
   							outStr += "Z" + (PlgSp).toFixed(4);
   						}

   						outStr += "F" + feedrateXY;
    					this.emit_gcode (outStr);
   					break;

   					case 3:
   						nextX = (pckt_startX + pckt_offsetX) + (pckt_stepX * j);
   						nextY = (pckt_startY + lenY - pckt_offsetY) - (pckt_stepY * j);

    					if ( RotationAngle === 0.0 ) { 
    						outStr = "G1X" + nextX + "Y" + nextY;
    					}
   						else {
   							outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
   										   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
   						}

   						if ( spiralPlg == 1 && pass === 0 ) { 
   							plgSp = currentZ + (Plg * 0.75);	
   							outStr += "Z" + (PlgSp).toFixed(4); 
   						}	

   						outStr += "F" + feedrateXY;
    					this.emit_gcode (outStr);
    				break;

    				case 4:
   						nextX = (pckt_startX + pckt_offsetX) + (pckt_stepX * j);
   						nextY = (pckt_startY + pckt_offsetY) + (pckt_stepY * j);

    					if ( RotationAngle === 0.0 ) { 
    						outStr = "G1X" + nextX + "Y" + nextY;
    					}
   						else {
   							outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
   										   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
   						}

   						if ( spiralPlg === 1 && pass === 0 ) {
   							currentZ += Plg; 
   							outStr += "Z" + (currentZ).toFixed(4);
                pass = 1;
                if ( i+1 < reps ){
								  cnt = 1;
                } 
   						}
   						else { 
   							cnt = 1;
   						}

   						outStr += "F" + feedrateXY;
   						this.emit_gcode (outStr);
   					break;

   					default:
   						throw "Unhandled operation: " + expr.op;
   				}
   			}
			} while ( cnt < 1 );
  
			if ( (j + 1) < steps && optCR > 1 ) {
				nextX = (pckt_startX + pckt_offsetX) + (pckt_stepX * (j+1));
   			nextY = (pckt_startY + pckt_offsetY) + (pckt_stepY * (j+1));
				if ( RotationAngle === 0 ) { 
			  	outStr = "G1X" + nextX + 
   							   "Y" + nextY;
   			}
   			else {
   				outStr = "G1X" + ((nextX * cosRA) - (nextY * sinRA) + (rotPtX * (1-cosRA)) + (rotPtY * sinRA)).toFixed(4) +
   							   "Y" + ((nextX * sinRA) + (nextY * cosRA) + (rotPtX * (1-cosRA)) - (rotPtY * sinRA)).toFixed(4); 
   			}
   			outStr += "F" + feedrateXY;
    		this.emit_gcode (outStr);
   		}
   	}

   	// If a pocket, move to the start point of the pocket
	  if ( optCR > 1 || stCorner === 0 ) {
    	this.emit_gcode( "G0Z" + safeZCG );
    	outStr = "G1X" + startX + "Y" + startY;
			outStr += "F" + feedrateXY;
     	this.emit_gcode( outStr );
     	if ( ( i + 1 ) != reps ) { 
     		this.emit_gcode( "G1Z" + currentZ ); 
     	}
   	}
  }

  if( noPullUp === 0 && currentZ !== startZ ){    //If No pull-up is set to YES, pull up to the starting Z location
    this.emit_gcode( "G0Z" + startZ);
    this.cmd_posz = startZ;
  }
  else{										//If not, stay at the ending Z height
  	this.cmd_posz = currentZ;
  }

  if ( optCR === 3 ) {
    this.emit_gcode( "G0X" + startX + "Y" + startY );
  }

  this.cmd_posx = startX;
	this.cmd_posy = startY;

};
