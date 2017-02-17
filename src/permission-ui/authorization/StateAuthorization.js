'use strict';

/**
 * Service responsible for handling inheritance-enabled state-based authorization in ui-router
 * @extends permission.PermPermissionMap
 * @name permission.ui.PermStateAuthorization
 *
 * @param $q {Object} Angular promise implementation
 * @param PermStatePermissionMap {permission.ui.PermStatePermissionMap|Function} Angular promise implementation
 */
function PermStateAuthorization($q, PermStatePermissionMap) {
  'ngInject';

  this.authorizeByPermissionMap = authorizeByPermissionMap;
  this.authorizeByState = authorizeByState;

  /**
   * Handles authorization based on provided state permission map
   * @methodOf permission.ui.PermStateAuthorization
   *
   * @param statePermissionMap
   *
   * @return {promise}
   */
  function authorizeByPermissionMap(statePermissionMap) {
    return authorizeStatePermissionMap(statePermissionMap);
  }

  /**
   * Authorizes uses by provided state definition
   * @methodOf permission.ui.PermStateAuthorization
   *
   * @param state {Object}
   * @returns {promise}
   */
  function authorizeByState(state) {
    var permissionMap = new PermStatePermissionMap(state);

    return authorizeByPermissionMap(permissionMap);
  }

  /**
   * Checks authorization for complex state inheritance
   * @methodOf permission.ui.PermStateAuthorization
   * @private
   *
   * @param map {permission.ui.StatePermissionMap} State access rights map
   *
   * @returns {promise} $q.promise object
   */
  function authorizeStatePermissionMap(map) {
    var deferred = $q.defer();

    resolveExceptStatePermissionMap(deferred, map);

    return deferred.promise;
  }

  /**
   * Resolves compensated set of "except" privileges
   * @methodOf permission.ui.PermStateAuthorization
   * @private
   *
   * @param deferred {Object} Promise defer
   * @param map {permission.ui.StatePermissionMap} State access rights map
   */
  function resolveExceptStatePermissionMap(deferred, map) {
    var exceptPromises = resolveStatePermissionMap(map.except, map);

    $q.all(exceptPromises)
      .then(function (rejectedPermissions) {
        deferred.reject(rejectedPermissions[0]);
      })
      .catch(function () {
        resolveOnlyStatePermissionMap(deferred, map);
      });
  }

  /**
   * Resolves compensated set of "only" privileges
   * @methodOf permission.ui.PermStateAuthorization
   * @private
   *
   * @param deferred {Object} Promise defer
   * @param map {permission.ui.StatePermissionMap} State access rights map
   */
  function resolveOnlyStatePermissionMap(deferred, map) {
    if (!map.only.length) {
      deferred.resolve();
      return;
    }

    var onlyPromises = resolveStatePermissionMap(map.only, map);

    $q.all(onlyPromises)
      .then(function (resolvedPermissions) {
        deferred.resolve(resolvedPermissions);
      })
      .catch(function (rejectedPermission) {
        deferred.reject(rejectedPermission);
      });
  }

  /**
   * Performs iteration over list of privileges looking for matches
   * @methodOf permission.ui.PermStateAuthorization
   * @private
   *
   * @param privilegesNames {Array} Array of sets of access rights
   * @param map {permission.ui.StatePermissionMap} State access rights map
   *
   * @returns {Array<Promise>} Promise collection
   */
  function resolveStatePermissionMap(privilegesNames, map) {
    if (!privilegesNames.length) {
      return [$q.reject()];
    }

    // This evaluates the access rights in order, such that the 
    // its failure order is predictable. 
    var promises = [];
    privilegesNames.reduce(function (prev, statePrivileges) {
      promises.push($q(function(resolve, reject) {
        prev.finally(function() {
          var resolvedStatePrivileges = map.resolvePropertyValidity(statePrivileges);
          $q.any(resolvedStatePrivileges)
            .then(function (resolvedPermissions) {
              if (angular.isArray(resolvedPermissions)) {
                return resolvedPermissions[0];
              }
              return resolvedPermissions;
            })
            .then(resolve, reject);
        });
      }));
      return promises[promises.length - 1];
    }, $q.resolve());
    
    return promises;
  }
}

angular
  .module('permission')
  .service('PermStateAuthorization', PermStateAuthorization);