/**
 * Created by jbblanc on 04/06/2016.
 */

'use strict';
const http = require('http');
const SonosDiscovery = require('sonos-discovery');
const SonosAPI = require('./services/sonos.js');
const nodeStatic = require('node-static');
const fs = require('fs');
const path = require('path');
const webroot = path.resolve(__dirname, 'static');
const parser = require('./services/parser')
const log = require('./services/log').logger;
const _ = require('lodah');
const settings = {
    port: parseInt(process.env.port) + 1,
    cacheDir: './cache',
    webroot: webroot
};



log.info('Sonos Module has started');
ipc.start(process.env);
// Create webroot + tts if not exist
if (!fs.existsSync(webroot)) {
    fs.mkdirSync(webroot);
}
if (!fs.existsSync(webroot + '/tts/')) {
    fs.mkdirSync(webroot + '/tts/');
}

exports.start = function(cnx){
    let fileServer = new nodeStatic.Server(webroot);
    let discovery = new SonosDiscovery(settings);
    const  global.api = new SonosAPI(discovery, settings);

    var requestHandler = function (req, res) {
        req.addListener('end', function () {
            fileServer.serve(req, res, function (err) {
                if (!err) return;
                if (req.method === 'GET') api.httpRequestHandler(req, res);
            });
        }).resume();
    };

    var server = http.createServer(requestHandler);
    
    server.listen(settings.port, function () {
        console.log('http server listening on port', settings.port);
        setTimeout(function(){
            api.requestHandler(null,'zones',null,function(players){
                _.forEach(players,function(player){
                    parser.addPlayer(player,cnx)
                })
            })
        }, 2000);
        
    });
}
