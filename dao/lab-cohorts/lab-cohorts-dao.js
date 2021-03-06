/*jshint -W003, -W097, -W117, -W026 */
'use strict';

var db = require('../../etl-db');
var _ = require('underscore');
var reportFactory = require('../../etl-factory');
var helpers = require('../../etl-helpers');
var eidPatientCohortService = require('../../service/eid/eid-patient-cohort.service');
var config = require('../../conf/config');
var etlLogger = require('../../etl-file-logger');

module.exports = {

  loadLabCohorts: loadLabCohorts,
  syncLabCohorts: syncLabCohorts
}

var max_limit = 1000;

function loadLabCohorts(request, reply) {

  var startDate = request.query.startDate;
  var endDate = request.query.endDate;
  var limit = request.query.limit;
  var offset = request.query.offset;

  load(startDate, endDate, limit, offset)
    .then(function(data) {
      reply(data);
    }).catch(function(err) {
      etlLogger.logger(config.logging.eidPath + '/' + config.logging.eidFile)
        .error('Error Loading lab cohorts: ' + err.stack.split('/n'));
      reply({
        errorMessage: 'error generating report',
        error: err
      });
    });
}

function syncLabCohorts(request, reply) {

  var startDate = request.query.startDate;
  var endDate = request.query.endDate;
  var limit = max_limit;
  var offset = 0;

  var params = {
    startDate: startDate,
    endDate: endDate,
    limit: limit,
    offset: offset
  };

  etlLogger.logger(config.logging.eidPath + '/' + config.logging.eidFile).info('Starting Patient Sync...');
  //load uuids and loop through them
  sync(params,reply);
}

/*
 * Loads records from the db using an encounter date range
 * @params startDate, endDate
 */
function load(startDate, endDate, limit, offset) {

  offset = isNaN(offset) ? 0 : offset;
  limit = isNaN(limit) ? max_limit : limit;

  if(!isNaN(limit) && parseInt(limit) > max_limit) limit = max_limit;

  var columns = ["distinct pe.uuid"];

  var qParts = {
    columns: columns,
    table: "amrs.patient",
    alias: 'p',
    where: ["e.date_created between ? and ?", startDate, endDate],
    leftOuterJoins: [
      ["amrs.person", "pe", "pe.person_id = p.patient_id"],
      ["amrs.encounter", "e", "e.patient_id = p.patient_id"]
    ],
    offset: offset,
    limit: limit
  };

  return db.queryDb(qParts);
};

/*
 * Loads records from db and posts them to the sync function.
 * Calls itself until all db records are syncd
 */
function sync(params, reply) {

  var limit = params.limit;

  etlLogger.logger(config.logging.eidPath + '/' + config.logging.eidFile).info('Loading db data: params: '+ JSON.stringify(params));

  load(params.startDate, params.endDate, limit, params.offset)
    .then(function(data) {

      var size = data.size;
      var offset = data.startIndex;

      if(size > 0)
        return post(data).then(function(post_status) {

          if(size == limit) {

            offset += size;
            params.offset = offset;
            //repeat sync until there are no more records to load from db
            sync(params, reply);

          } else {
            reply({
              status: "success"
            });
          }
        });
      else {

        reply({
          status: "success"
        });
      }
    }).catch(function(err) {
      reply({
        errorMessage: 'error generating report',
        error: err
      })
    });
}

/*
 * Posts an array of uuids to the sync function
 */
function post(data) {

  var arr = [];

  _.each(data.result, function(row) {
    arr.push(row.uuid);
  });

  etlLogger.logger(config.logging.eidPath + '/' + config.logging.eidFile).info('syncronizing ' + arr.length + ' records');

  return new Promise(function(resolve, reject) {
    eidPatientCohortService.synchronizePatientCohort(arr, function(res) {
      etlLogger.logger(config.logging.eidPath + '/' + config.logging.eidFile).info('Sync Result: '+ res);
      resolve(res);
    });
  });
}
