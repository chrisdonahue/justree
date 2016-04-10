window.justree = window.justree || {};

(function (justree, osc, fingerprint) {
	var server = justree.server = {};
	
	var clientFingerprint = ((new Date()).getTime()) % (new fingerprint().get());

	var callbackOpen = function (event) {
		console.log('socket open');
		server.connected = true;
		server.osc.send('/connect');
	};
	var callbackClose = function (event) {
		console.log('socket close');
		server.connected = false;
		alert('Connection lost. Please refresh this page');
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
		try {
			server.connected = false;
			var serverAddress = 'ws://' + ip + ':' + port;
			console.log(serverAddress);
			server.socketOsc = new osc.WebSocketPort({
				url: serverAddress
			});
		}
		catch (e) {
			alert('Could not connect to server. Try refreshing.');
			throw 'Could not connect to server';
		}

		// register socket callbacks
		server.socketOsc.on('open', server.callbackOpen);
		server.socketOsc.on('close', server.callbackClose);
		server.socketOsc.on('message', server.callbackMessage);
		server.socketOsc.on('error', server.callbackError);

		// open socket
		console.log('connecting');
		server.socketOsc.open();
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
		else {
			console.log('not connected to server');
			console.log(messageAddress);
			console.log(parameters);
		}
	};

})(window.justree, window.osc, window.Fingerprint);