// http://stackoverflow.com/questions/11275870/how-can-i-automatically-start-a-node-js-application-in-amazon-linux-ami-on-aws
// https://www.thepolyglotdeveloper.com/2015/10/create-a-simple-restful-api-with-node-js/

// imports
var express = require('express');
var expressValidator = require('express-validator');
var bodyParser = require('body-parser');
var path = require('path');
var fs = require('fs');

// config
var treesDirPath = './justrees/';
var fileEncoding = 'utf8';
var serverPort = 80;

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
		justrees[fileId] = justree;
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
	console.log(req);
});

// start server
var server = app.listen(serverPort, function () {
	console.log('Listening on port %s...', server.address().port);
});