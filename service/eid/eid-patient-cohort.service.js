'use strict';
var syncService=require('../eid.service');
var _ = require('underscore');
var Promise=require('bluebird');
var moment=require('moment');
var config=require('../../conf/config');
var etlLogger = require('../../etl-file-logger');
module.exports = function(){
  function synchronizePatientCohort(patientUuIdCohort,reply){
    Promise.reduce(patientUuIdCohort,function(previous,patientUuId){
      return syncService.getSynchronizedPatientLabResults(patientUuId,function(){})
      .then(function(response){
        return response;
      },function(error) {
         etlLogger.logRequestError('SynchronizedPatientLabResults request error. Details:' + error,
         config.logging.eidFile, config.logging.eidPath);
         return error;
      });
      },0).then(function(data){
      reply("patient cohort synchronization completed");
    });
}
  return {
    synchronizePatientCohort:synchronizePatientCohort
  }
}();
