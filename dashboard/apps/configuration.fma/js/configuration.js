var unit_label_index = {}

var registerUnitLabel = function(label, in_label, mm_label) {
  var labels = {
    'in' : in_label,
    'mm' : mm_label
  }
  unit_label_index[label] = labels;
}

var updateLabels = function(unit) {
	$.each(unit_label_index, function(key, value) {
		$(key).html(value[unit]);
	});
}

var flattenObject = function(ob) {
  var toReturn = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if ((typeof ob[i]) == 'object') {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
    
        toReturn[i + '_' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
};

function update() {
    fabmo.getConfig(function(err, data) {
      if(err) {
        console.error(err);
      } else {
        configData = data;
        console.log("Read configData");
        ['driver', 'engine', 'opensbp', 'machine'].forEach(function(branchname) {
            if(branchname === 'machine') {
              branch = flattenObject(data[branchname]);
            } else {
              branch = data[branchname];
            }
            for(key in branch) {
              v = branch[key];
              input = $('#' + branchname + '_' + key);
              if(input.length) {
                input.val(String(v));
              }
            }
        });
        var unit1 = (360/data.driver['1sa']) * data.driver['1mi'] / data.driver['1tr'];
        $("#opensbp_units1").val(unit1);
        var unit2 = (360/data.driver['2sa']) * data.driver['2mi'] / data.driver['2tr'];
        $("#opensbp_units2").val(unit2);
        var unit3 = (360/data.driver['3sa']) * data.driver['3mi'] / data.driver['3tr'];
        $("#opensbp_units3").val(unit3);
        var unit4 = (360/data.driver['4sa']) * data.driver['4mi'] / data.driver['4tr'];
        $("#opensbp_units4").val(unit4);
        var unit5 = (360/data.driver['5sa']) * data.driver['5mi'] / data.driver['5tr'];
        $("#opensbp_units5").val(unit5);
        var unit6 = (360/data.driver['6sa']) * data.driver['6mi'] / data.driver['6tr'];
        $("#opensbp_units6").val(unit6);
      }
    });
}

function setConfig(id, value) {
    var parts = id.split("_");
    var type = parts[0];
    var key = parts[1];
    // Workaround for (restify bug?)
    if(key[0].match(/[0-9]/)) {
      key = '_' + key;
    }
    var o = {};
    o[key] = value;
    cfg = {};
    cfg[type] = o;
    fabmo.setConfig(cfg, function(err, data) {
      update();
    });
}

function setConfig(id, value) {
	var parts = id.split("_");
	var o = {};
	var co = o;
	var i=0;

	do {
	  co[parts[i]] = {};
	  if(i < parts.length-1) {
	    co = co[parts[i]];            
	  }
	} while(i++ < parts.length-1 );

	co[parts[parts.length-1]] = value;
	fabmo.setConfig(o, function(err, data) {
	  update();
	});
}