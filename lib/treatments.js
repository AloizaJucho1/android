'use strict';

function storage (env, ctx) {
  var ObjectID = require('mongodb').ObjectID;

  // allow regexp search
  // /api/v1/treatments.json?find[notes]=/sometext/i
  function find_query (opts) {
    var reg;
    ['notes','eventType'].forEach(function(d) {
      if (opts && opts.find && opts.find[d] && (reg=/\/(.*)\/(.*)/.exec(opts.find[d]))) {
      opts.find[d] = new RegExp(reg[1],reg[2]);
      }
    });
    return opts;
  }

  function create (obj, fn) {

    var results = prepareData(obj);

    api( ).insert(obj, function (err, doc) {
      fn(null, doc);

      if (obj.preBolus) {
        //create a new object to insert copying only the needed fields
        var pbTreat = {
          created_at: (new Date(results.created_at.getTime() + (obj.preBolus * 60000))).toISOString(),
          eventType: obj.eventType,
          carbs: results.preBolusCarbs
        };

        if (obj.notes) {
          pbTreat.notes = obj.notes;
        }

        api( ).insert(pbTreat, function() {
          //nothing to do here
        });
      }

      //TODO: this is triggering a read from Mongo, we can do better
      ctx.bus.emit('data-received');

    });
  }

  function list (opts, fn) {
    function find ( ) {
	  var finder = find_query(opts);
      var q = finder && finder.find ? finder.find : { };
      return q;
    }

    return ctx.store.limit.call(api().find(find( )).sort(opts && opts.sort || {created_at: -1}), opts).toArray(fn);
  }

  function remove (_id, fn) {
    return api( ).remove({ "_id": new ObjectID(_id) }, fn);
  }

  function save (obj, fn) {
    obj._id = new ObjectID(obj._id);
    api().save(obj, fn);
  }


  function api ( ) {
    return ctx.store.db.collection(env.treatments_collection);
  }

  api.list = list;
  api.create = create;
  api.remove = remove;
  api.save = save;
  api.indexedFields = indexedFields;
  return api;
}

function prepareData(obj) {

  //NOTE: the eventTime is sent by the client, but deleted, we only store created_at right now
  var results = {
    created_at: new Date()
    , preBolusCarbs: ''
  };

  var eventTime;
  if (obj.eventTime) {
    eventTime = new Date(obj.eventTime);
    results.created_at = eventTime;
  }
  
  obj.created_at = results.created_at.toISOString();
  if (obj.preBolus !== 0 && obj.carbs) {
    results.preBolusCarbs = obj.carbs;
    delete obj.carbs;
  }

  if (obj.eventType === 'Announcement') {
    obj.isAnnouncement = true;
  }

  // clean data
  delete obj.eventTime;

  function deleteIfEmpty (field) {
    if (!obj[field] || obj[field] === 0) {
      delete obj[field];
    }
  }

  deleteIfEmpty('carbs');
  deleteIfEmpty('insulin');
  deleteIfEmpty('notes');
  deleteIfEmpty('preBolus');

  if (!obj.glucose || obj.glucose === 0) {
    delete obj.glucose;
    delete obj.glucoseType;
    delete obj.units;
  }

  return results;
}

var indexedFields = ['created_at', 'eventType','boluscalc.foods._id','notes'];

module.exports = storage;

