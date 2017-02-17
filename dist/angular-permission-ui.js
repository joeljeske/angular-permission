/**
 * angular-permission-ui
 * Extension module of angular-permission for access control within ui-router
 * @version v5.1.0 - 2017-02-17
 * @link https://github.com/Narzerus/angular-permission
 * @author Rafael Vidaurre <narzerus@gmail.com> (http://www.rafaelvidaurre.com), Blazej Krysiak <blazej.krysiak@gmail.com>
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */

(function (window, angular, undefined) {
  'use strict';

  /**
   * @namespace permission.ui
   */

  /**
   * @param $stateProvider {Object}
   */
  config.$inject = ['$stateProvider'];
  state.$inject = ['$delegate', '$q', '$rootScope', 'PermTransitionProperties', 'PermTransitionEvents', 'PermStateAuthorization', 'PermStatePermissionMap'];
  PermTransitionEvents.$inject = ['$delegate', '$rootScope', 'PermTransitionProperties', 'PermTransitionEventNames'];
  PermStateAuthorization.$inject = ['$q', 'PermStatePermissionMap'];
  PermStatePermissionMap.$inject = ['PermPermissionMap'];

  function config($stateProvider) {
    'ngInject';

    $stateProvider.decorator('$state', function (state) {
      /**
       * Property containing full state object definition
       *
       * This decorator is required to access full state object instead of just it's configuration
       * Can be removed when implemented https://github.com/angular-ui/ui-router/issues/13.
       *
       * @returns {Object}
       */
      state.self.$$permissionState = function () {
        return state;
      };

      return state;
    });
  }

  /**
   * @param $delegate {Object} The $state decorator delegate
   * @param $q {Object}
   * @param $rootScope {Object}
   * @param PermTransitionProperties {permission.PermTransitionProperties}
   * @param PermTransitionEvents {permission.ui.PermTransitionEvents}
   * @param PermStateAuthorization {permission.ui.PermStateAuthorization}
   * @param PermStatePermissionMap {permission.ui.PermStatePermissionMap}
   */
  function state($delegate, $q, $rootScope, PermTransitionProperties, PermTransitionEvents, PermStateAuthorization, PermStatePermissionMap) {
    'ngInject';

    var $state = $delegate;
    // Expose only for testing purposes
    $state.$$transitionTo = $state.transitionTo;

    $state.transitionTo = function (to, toParams, options) {
      // Similar param normalization as in $state.transitionTo
      toParams = toParams || {};
      options = angular.extend({
        location: true,
        inherit: false,
        relative: null,
        notify: true,
        reload: false,
        $retry: false
      }, options || {});
      var toState, fromState = $state.current,
        fromParams = $state.params;
      var name = angular.isString(to) ? to : to.name;

      if (!options.relative && isRelative(name)) {
        throw new Error('No reference point given for path \'' + name + '\'');
      }

      toState = $state.get(name, options.relative);

      if (!toState) {
        throw new Error('Unfound state \'' + name + '\'');
      }

      setTransitionProperties();

      // Maintain UI-Router behavior when $stateChangeStart is cancelled
      if (PermTransitionEvents.isStateChangeStartDefaultPrevented()) {
        return $q.reject(new Error('transition cancelled'));
      }

      // Delegate directly to UI-Router when $stateChangePermissionStart is cancelled
      if (PermTransitionEvents.isStateChangePermissionStartDefaultPrevented()) {
        return delegateTransitionTo();
      }

      var statePermissionMap = new PermStatePermissionMap(PermTransitionProperties.toState);

      return PermStateAuthorization
        .authorizeByPermissionMap(statePermissionMap)
        .then(handleAuthorizedState, handleUnauthorizedState(statePermissionMap));

      /**
       * True if the stateName is a relative name, to an parent state
       * @method
       * @private

       * @param status {string} Name of state
       * @returns {boolean}
       */
      function isRelative(stateName) {
        return stateName.indexOf('.') === 0 || stateName.indexOf('^') === 0;
      }

      /**
       * Updates values of `PermTransitionProperties` holder object
       * @method
       * @private
       */
      function setTransitionProperties() {
        PermTransitionProperties.toState = toState;
        PermTransitionProperties.toParams = toParams;
        PermTransitionProperties.fromState = fromState;
        PermTransitionProperties.fromParams = fromParams;
        PermTransitionProperties.options = options;
      }

      /**
       * Performs $state.transitionTo with parameters
       * @method
       * @private
       * 
       * @returns {Promise}
       */
      function delegateTransitionTo() {
        return $state.$$transitionTo(PermTransitionProperties.toState.name,
          PermTransitionProperties.toParams, PermTransitionProperties.options);
      }

      /**
       * Handles redirection for authorized access
       * @method
       * @private
       */
      function handleAuthorizedState() {
        PermTransitionEvents.broadcastPermissionAcceptedEvent();

        return delegateTransitionTo();
      }

      /**
       * Handles redirection for unauthorized access
       * @method
       * @private
       *
       * @param statePermissionMap {permission.ui.PermPermissionMap} State permission map
       * @returns {Function} A function that accepts the rejectedPermission access right
       */
      function handleUnauthorizedState(statePermissionMap) {
        return function (rejectedPermission) {
          PermTransitionEvents.broadcastPermissionDeniedEvent();

          return statePermissionMap
            .resolveRedirectState(rejectedPermission)
            .then(function (redirect) {
              return $state.go(redirect.state, redirect.params, redirect.options);
            });
        };
      }
    };

    return $state;
  }

  var uiPermission = angular
    .module('permission.ui', ['permission', 'ui.router'])
    .config(config)
    .decorator('$state', state);

  if (typeof module !== 'undefined' && typeof exports !== 'undefined' && module.exports === exports) {
    module.exports = uiPermission.name;
  }


  /**
   * Service responsible for managing and emitting events
   * @name permission.ui.PermTransitionEvents
   *
   * @extends permission.PermTransitionEvents
   *
   * @param $delegate {Object} Parent instance being extended
   * @param $rootScope {Object} Top-level angular scope
   * @param PermTransitionProperties {permission.PermTransitionProperties} Helper storing transition parameters
   * @param PermTransitionEventNames {permission.ui.PermTransitionEventNames} Constant storing event names
   */
  function PermTransitionEvents($delegate, $rootScope, PermTransitionProperties, PermTransitionEventNames) {
    'ngInject';

    $delegate.isStateChangeStartDefaultPrevented = isStateChangeStartDefaultPrevented;
    $delegate.isStateChangePermissionStartDefaultPrevented = isStateChangePermissionStartDefaultPrevented;
    $delegate.broadcastPermissionStartEvent = broadcastPermissionStartEvent;
    $delegate.broadcastPermissionAcceptedEvent = broadcastPermissionAcceptedEvent;
    $delegate.broadcastPermissionDeniedEvent = broadcastPermissionDeniedEvent;

    /**
     * Broadcasts "$stateChangePermissionStart" event from $rootScope
     * @methodOf permission.ui.PermTransitionEvents
     */
    function broadcastPermissionStartEvent() {
      $rootScope.$broadcast(PermTransitionEventNames.permissionStart,
        PermTransitionProperties.toState, PermTransitionProperties.toParams,
        PermTransitionProperties.options);
    }

    /**
     * Broadcasts "$stateChangePermissionAccepted" event from $rootScope
     * @methodOf permission.ui.PermTransitionEvents
     */
    function broadcastPermissionAcceptedEvent() {
      $rootScope.$broadcast(PermTransitionEventNames.permissionAccepted,
        PermTransitionProperties.toState, PermTransitionProperties.toParams,
        PermTransitionProperties.options);
    }

    /**
     * Broadcasts "$tateChangePermissionDenied" event from $rootScope
     * @methodOf permission.ui.PermTransitionEvents
     */
    function broadcastPermissionDeniedEvent() {
      $rootScope.$broadcast(PermTransitionEventNames.permissionDenies,
        PermTransitionProperties.toState, PermTransitionProperties.toParams,
        PermTransitionProperties.options);
    }

    /**
     * Checks if event $stateChangePermissionStart hasn't been disabled by default
     * @methodOf permission.ui.PermTransitionEvents
     *
     * @returns {boolean}
     */
    function isStateChangePermissionStartDefaultPrevented() {
      return $rootScope.$broadcast(PermTransitionEventNames.permissionStart,
        PermTransitionProperties.toState, PermTransitionProperties.toParams,
        PermTransitionProperties.options).defaultPrevented;
    }

    /**
     * Checks if event $stateChangeStart hasn't been disabled by default
     * @methodOf permission.ui.PermTransitionEvents
     *
     * @returns {boolean}
     */
    function isStateChangeStartDefaultPrevented() {
      return $rootScope.$broadcast('$stateChangeStart',
        PermTransitionProperties.toState, PermTransitionProperties.toParams,
        PermTransitionProperties.fromState, PermTransitionProperties.fromParams,
        PermTransitionProperties.options).defaultPrevented;
    }

    return $delegate;
  }

  angular
    .module('permission.ui')
    .decorator('PermTransitionEvents', PermTransitionEvents);

  /**
   * Constant storing event names for ng-route
   * @name permission.ui.PermTransitionEventNames
   *
   * @type {Object.<String,Object>}
   *
   * @property permissionStart {String} Event name called when started checking for permissions
   * @property permissionAccepted {String} Event name called when authorized
   * @property permissionDenies {String} Event name called when unauthorized
   */
  var PermTransitionEventNames = {
    permissionStart: '$stateChangePermissionStart',
    permissionAccepted: '$stateChangePermissionAccepted',
    permissionDenies: '$stateChangePermissionDenied'
  };

  angular
    .module('permission.ui')
    .value('PermTransitionEventNames', PermTransitionEventNames);


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
        promises.push($q(function (resolve, reject) {
          prev.finally(function () {
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

  /**
   * State Access rights map factory
   * @function
   *
   * @param PermPermissionMap {permission.PermPermissionMap|Function}
   *
   * @return {permission.ui.StatePermissionMap}
   */
  function PermStatePermissionMap(PermPermissionMap) {
    'ngInject';

    StatePermissionMap.prototype = new PermPermissionMap();

    /**
     * Constructs map instructing authorization service how to handle authorizing
     * @constructor permission.ui.StatePermissionMap
     * @extends permission.PermPermissionMap
     */
    function StatePermissionMap(state) {
      var toStateObject = state.$$permissionState();
      var toStatePath = toStateObject.path;

      angular.forEach(toStatePath, function (state) {
        if (areSetStatePermissions(state)) {
          var permissionMap = new PermPermissionMap(state.data.permissions);
          this.extendPermissionMap(permissionMap);
        }
      }, this);
    }

    /**
     * Extends permission map by pushing to it state's permissions
     * @methodOf permission.ui.StatePermissionMap
     *
     * @param permissionMap {permission.PermPermissionMap} Compensated permission map
     */
    StatePermissionMap.prototype.extendPermissionMap = function (permissionMap) {
      if (permissionMap.only.length) {
        this.only = this.only.concat([permissionMap.only]);
      }
      if (permissionMap.except.length) {
        this.except = this.except.concat([permissionMap.except]);
      }

      if (angular.isDefined(permissionMap.redirectTo)) {
        this.redirectTo = angular.extend({}, this.redirectTo, permissionMap.redirectTo);
      }
    };


    /**
     * Checks if state has set permissions
     * We check for hasOwnProperty, because ui-router lets the `data` property inherit from its parent
     * @methodOf permission.ui.StatePermissionMap
     * @private
     *
     * @returns {boolean}
     */
    function areSetStatePermissions(state) {
      try {
        return Object.prototype.hasOwnProperty.call(state.data, 'permissions');
      } catch (e) {
        return false;
      }
    }

    return StatePermissionMap;
  }

  angular
    .module('permission.ui')
    .factory('PermStatePermissionMap', PermStatePermissionMap);

}(window, window.angular));
