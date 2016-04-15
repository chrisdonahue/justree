// http://stackoverflow.com/questions/11275870/how-can-i-automatically-start-a-node-js-application-in-amazon-linux-ami-on-aws
// https://www.thepolyglotdeveloper.com/2015/10/create-a-simple-restful-api-with-node-js/

// imports
var util = require('util');
var express = require('express');
var expressValidator = require('express-validator');
var bodyParser = require('body-parser');
var path = require('path');
var fs = require('fs');

// config
var treesDirPath = './justrees/';
var fileEncoding = 'utf8';
var serverPort = 3000;

// scan directory
var justrees = [];
var files = fs.readdirSync(treesDirPath);
for (var i in files) {
	// parse path
	var fileName = files[i];
	var fileExtIndex = fileName.indexOf('.json');
	if (fileExtIndex <= -1) {
		continue;
	}

	// load file
	var fileId = fileName.substring(0, fileExtIndex);
	var filePath = treesDirPath + files[i];
	var fileData = null;
	try {
		var fileData = fs.readFileSync(filePath, fileEncoding);
		var justree = JSON.parse(fileData);
		if (!('serverTimeStamp' in justree)) {
			throw 'serverTimeStamp field not found';
		}
		justrees.push(justree);
	}
	catch (e) {
		console.log(fileName + ': ' + String(e));
	}
}

// sort trees
justrees.sort(function (a, b) {
	return b.serverTimeStamp - a.serverTimeStamp;
});

// app middleware
var app = express();
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(expressValidator([]));
app.use(express.static('static'));

// routes
app.get('/', function (req, res) {
	res.sendFile(path.join(__dirname + '/static/index.html'));
});
app.get('/justrees', function (req, res) {
	return res.json(justrees);
});
app.post('/justrees', function (req, res) {
	// validate
	req.checkBody('timeLen', 'Invalid time length.').notEmpty().isFloat({'min': 0.0});
	req.checkBody('freqMin', 'Invalid min frequency.').notEmpty().isFloat({'min': 0.0});
	req.checkBody('freqMaxRat', 'Invalid min frequency ratio.').notEmpty().isFloat({'min': 0.0});
	req.checkBody('author', 'Invalid author.').isLength({min: 1, max: 32});
	req.checkBody('name', 'Invalid name.').isLength({min: 1, max: 64});
	req.checkBody('justree', 'Invalid tree.').isLength({min: 3});

	// return errors if there are some
	var errors = req.validationErrors();
	if (errors) {
		var errorText = errors[0].msg;
		res.status(400).send(errorText);
		return;
	}

	// sanitize
	req.sanitizeBody('timeLen').toFloat();
	req.sanitizeBody('freqMin').toFloat();
	req.sanitizeBody('freqMaxRat').toFloat();
	var justree = req.body;
	var fileId = new Date().getTime();
	justree.serverTimeStamp = fileId;

	// create file
	var justreeJson = JSON.stringify(justree);
	fs.writeFileSync(treesDirPath + fileId + '.json', justreeJson, fileEncoding);

	// push to array
	justrees.unshift(justree);
	res.send('Success');
});

// start server
var server = app.listen(serverPort, function () {
	console.log('Listening on port %s...', server.address().port);
});