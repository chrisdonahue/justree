window.justree = window.justree || {};

(function (justree, osc, fingerprint) {
	var server = justree.server = {};
	
	//var clientFingerprint = ((new Date()).getTime()) % (new fingerprint().get());
	var clientFingerprint = new fingerprint().get();

	var callbackOpen = function (event) {
		console.log('socket open');
		server.connected = true;
		server.sendOsc('/connect');
	};
	var callbackClose = function (event) {
		console.log('socket close');
		server.connected = false;
	};
	var callbackMessage = function (event) {
		console.log('socket message: ' + event.data);
		alert(event.data);
	};
	var callbackError = function (event) {
		console.log('socket error: ' + event.data);
	};

	server.init = function () {
		server.connected = false;
		server.socketOsc = null;
	};

	server.connect = function (ip, port) {
		server.connected = false;
		var serverAddress = 
		server.socketOsc = new osc.WebSocketPort({
			url: 'ws://' + ip + ':' + port
		});

		// register socket callbacks
		server.socketOsc.on('open', callbackOpen);
		server.socketOsc.on('close', callbackClose);
		server.socketOsc.on('message', callbackMessage);
		server.socketOsc.on('error', callbackError);

		// open socket
		try {
			server.socketOsc.open();
		}
		catch (e) {
			alert('Could not connect to server. Try refreshing.');
			throw 'Could not connect to server';
		}
	};

	server.disconnect = function () {
		if (server.connected) {
			server.socketOsc.close();
		}
		server.connected = false;
		server.socketOsc = null;
	};

	server.sendOsc = function (messageAddress, parameters) {
		parameters = parameters || [];
		if (server.connected) {
			server.socketOsc.send({
				address: messageAddress,
				args: [clientFingerprint].concat(parameters)
			});
		}
	};

})(window.justree, window.osc, window.Fingerprint);