'use strict';
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const isRadioOrLineIn = require('../services/is-radio-or-line-in');
const findDoorBell = require('../services/findDoorBell');

let port;
let system;

const backupPresets = {};
let settings = {};

try {
  settings = require.main.require('./settings.json');
} catch (e) {
  console.error(e);
}

function doorBell(player, values) {

  let announceVolume = values[0] || 40 ;
 

  // Create backup preset to restore this player
  const state = player.state;

  let groupToRejoin;

  const backupPreset = {
    players: [
      { roomName: player.roomName, volume: state.volume }
    ]
  };

  if (player.coordinator.uuid == player.uuid) {
    // This one is coordinator, you will need to rejoin
    // remember which group you were part of.
    const group = system.zones.find(zone => zone.coordinator.uuid === player.coordinator.uuid);
    if (group.members.length > 1) {
      console.log('Think its coordinator, will find uri later');
      groupToRejoin = group.id;
      backupPreset.group = group.id;
    } else {
      // was stand-alone, so keep state
      backupPreset.state = state.playbackState;
      backupPreset.uri = player.avTransportUri;
      backupPreset.metadata = player.avTransportMetadata;
      backupPreset.playMode = {
        repeat: state.playMode.repeat
      };

      if (!isRadioOrLineIn(backupPreset.uri)) {
        backupPreset.trackNo = state.trackNo;
        backupPreset.elapsedTime = state.elapsedTime;
      }

    }
  } else {
    // Was grouped, so we use the group uri here directly.
    backupPreset.uri = `x-rincon:${player.coordinator.uuid}`;
  }

  console.log('backup preset was', backupPreset);

  // Use the preset action to play the tts file
  var doorBellPreset = {
    "players": [
      { "roomName": player.roomName, "volume": announceVolume }
    ],
    playMode: {
      repeat: false
    }
  };

  let announceFinished;
  let afterPlayingStateChange;

  const onTransportChange = (state) => {
    console.log(this.roomName, player.roomName, state.playbackState);

    if (state.playbackState === 'PLAYING') {
      afterPlayingStateChange = announceFinished;
    }

    if (state.playbackState !== "STOPPED") {
      return;
    }

    if (afterPlayingStateChange instanceof Function) {
      console.log('announcement finished');
      afterPlayingStateChange();
    }
  };

  let abortTimer;

  if (!backupPresets[player.roomName]) {
    backupPresets[player.roomName] = [];
  }

  backupPresets[player.roomName].unshift(backupPreset);

  const prepareBackupPreset = () => {
    const relevantBackupPreset = backupPresets[player.roomName].shift();

    if (!relevantBackupPreset) {
      return;
    }

    if (backupPresets[player.roomName].length > 0) {
      return Promise.resolve();
    }

    if (relevantBackupPreset.group) {
      const zone = system.zones.find(zone => zone.id === relevantBackupPreset.group);
      if (zone) {
        relevantBackupPreset.uri = `x-rincon:${zone.uuid}`;
      }
    }

    console.log('applying preset', relevantBackupPreset);
    return system.applyPreset(relevantBackupPreset);
  }

  return findDoorBell()
    .then((uri) => {
      doorBellPreset.uri = `http://${system.localEndpoint}:${port}${uri}`;
      console.log(doorBellPreset)
      return system.applyPreset(doorBellPreset);
    })
    .then(() => {
      system.applyPreset(doorBellPreset);
      player.on('transport-state', onTransportChange);
      return new Promise((resolve) => {
        announceFinished = resolve;

        abortTimer = setTimeout(() => {
          announceFinished = null;
          resolve();
        }, 30000);
      });
    })
    .then(() => {
      clearTimeout(abortTimer);
      player.removeListener('transport-state', onTransportChange);
    })
    .then(prepareBackupPreset)
    .catch((err) => {
      console.error(err, err.stack);
      player.removeListener('transport-state', onTransportChange);
      return prepareBackupPreset()
        .then(() => {
          // we still want to inform that stuff broke
          throw err;
        });
    });
}

module.exports = function (api) {
  port = api.getPort();
  api.registerAction('doorbell', doorBell);

  system = api.discovery;
}
