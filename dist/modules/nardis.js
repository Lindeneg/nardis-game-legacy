"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Nardis = void 0;
var city_1 = require("./core/city");
var route_1 = require("./core/route");
var upgrade_1 = require("./core/player/upgrade");
var player_1 = require("./core/player/player");
var train_1 = require("./core/train");
var resource_1 = require("./core/resource");
var types_1 = require("../types/types");
var constants_1 = require("../util/constants");
var util_1 = require("../util/util");
/**
 * @constructor
 * @param {GameData} data          - Object with GameData.
 * @param {Player[]} players       - Array with Players.
 *
 * @param {Player}   currentPlayer - (optional) Player instance of the current turn taker.
 * @param {number}   currentTurn   - (optional) Number describing the current turn.
 */
var Nardis = /** @class */ (function () {
    function Nardis(gameData, players, currentPlayer, turn) {
        var _this = this;
        this.getCurrentPlayer = function () { return _this._currentPlayer; };
        this.getCurrentTurn = function () { return _this._turn; };
        /**
         * Runs at the start of each turn cycle. One cycle is when every player in-game has ended their turn.
         */
        this.startTurn = function () {
            var handleTurnInfo = {
                turn: _this._turn,
                data: _this.data,
                playerData: {
                    routes: _this._currentPlayer.getRoutes(),
                    upgrades: _this._currentPlayer.getUpgrades()
                }
            };
            __spreadArrays(_this.data.cities, _this.data.resources, [_this._currentPlayer]).forEach(function (turnComponent) {
                turnComponent.handleTurn(handleTurnInfo);
            });
        };
        /**
         * Runs when the Human player's turn is concluded. Then all Computer actions are handled in the turn.
         */
        this.endTurn = function () {
            _this.handleComputerTurn();
            _this._turn++;
            _this.saveGame();
        };
        /**
         * Get array of PotentialRoute objects respecting the current Players maximum range.
         *
         * @param {City}              origin - City instance of initial departure
         *
         * @return {PotentialRoute[]}          Array of PotentialRoutes
         */
        this.getArrayOfPossibleRoutes = function (origin) {
            var constraint = _this._currentPlayer.getRange();
            var potentialRoutes = [];
            _this.data.cities.forEach(function (city) {
                var distance = city.distanceTo(origin);
                var _a = _this.getPotentialRouteCost(distance), goldCost = _a.goldCost, turnCost = _a.turnCost;
                if (distance > 0 && distance <= constraint) {
                    potentialRoutes.push({
                        cityOne: origin,
                        cityTwo: city,
                        distance: distance,
                        goldCost: goldCost,
                        turnCost: turnCost,
                        purchasedOnTurn: _this._turn
                    });
                }
            });
            return potentialRoutes;
        };
        /**
         * @return {{train: Train, cost: number}[]} Array of Trains with their cost adjusted to reflect potential Player Upgrades.
         */
        this.getArrayOfAdjustedTrains = function () {
            var upgrades = _this._currentPlayer.getUpgrades().filter(function (upgrade) { return upgrade.type === types_1.UpgradeType.TrainValueCheaper; });
            return _this.data.trains.map(function (train) {
                var cost = train.cost;
                upgrades.forEach(function (upgrade) {
                    cost -= Math.floor(cost * upgrade.value);
                });
                return {
                    train: train,
                    cost: cost
                };
            });
        };
        /**
         * @return {object} Object describing the current win state.
         */
        this.hasAnyPlayerWon = function () {
            var result = _this.players.filter(function (player) { return player.gold > 10000; });
            return {
                player: result ? result[0] : null,
                hasWon: !!result
            };
        };
        /**
         * Add an entry to Player queue.
         *
         * @param {BuyableRoute} buyableRoute - BuyableRoute to add.
         */
        this.addRouteToPlayerQueue = function (buyableRoute) {
            var route = new route_1.default(buyableRoute.cityOne.name + " <--> " + buyableRoute.cityTwo.name, buyableRoute.cityOne, buyableRoute.cityTwo, buyableRoute.train, buyableRoute.routePlanCargo, buyableRoute.distance, buyableRoute.goldCost, buyableRoute.purchasedOnTurn);
            _this.handleNewRoutePlayerFinance(buyableRoute, route.id);
            _this._currentPlayer.addRouteToQueue(route, buyableRoute.turnCost);
        };
        /**
         * Add Upgrade to Player.
         *
         * @param {string}   id - String with id of Upgrade to add.
         *
         * @return {boolean} True if Upgrade was added else false.
         */
        this.addUpgradeToPlayer = function (id) {
            var matchedUpgrade = _this.data.upgrades.filter(function (upgrade) { return upgrade.id === id; });
            if (matchedUpgrade) {
                _this._currentPlayer.addUpgrade(matchedUpgrade[0]);
                _this._currentPlayer.getFinance().addToFinanceExpense(types_1.FinanceType.Upgrade, matchedUpgrade[0].id, 1, matchedUpgrade[0].cost);
                return true;
            }
            return false;
        };
        /**
         * Remove an entry from Player queue.
         *
         * @param {string}   routeId - String with id of Route to remove.
         * @param {string}   trainId - String with id of Train in Route.
         *
         * @return {boolean} True if Route was removed from queue else false.
         */
        this.removeRouteFromPlayerQueue = function (routeId, trainId) {
            if (_this._currentPlayer.removeRouteFromQueue(routeId)) {
                return _this.handleRemoveRouteFromPlayerFinance(routeId, trainId);
            }
            return false;
        };
        /**
         * Clear the saved game state from localStorage.
         */
        this.clearStorage = function () {
            constants_1.localKeys.forEach(function (key) {
                window.localStorage.removeItem(key);
            });
        };
        /**
         * Iterate over each Computer player and handle their turns accordingly.
         */
        this.handleComputerTurn = function () {
            var actualPlayer = _this._currentPlayer;
            _this.players.forEach(function (player) {
                if (!(player.equals(_this._currentPlayer)) && player.playerType === types_1.PlayerType.Computer) {
                    _this._currentPlayer = player;
                    player.handleTurn({ turn: _this._turn, data: _this.data, playerData: {
                            routes: player.getRoutes(),
                            upgrades: player.getUpgrades()
                        }
                    });
                }
            });
            _this._currentPlayer = actualPlayer;
        };
        /**
         * Handle Player expenses when purchasing a new Route and Train.
         *
         * @param {BuyableRoute} buyableRoute - BuyableRoute object.
         * @param {string}       id           - String with id of the Route.
         */
        this.handleNewRoutePlayerFinance = function (buyableRoute, id) {
            var finance = _this._currentPlayer.getFinance();
            finance.addToFinanceExpense(types_1.FinanceType.Track, id, 1, buyableRoute.goldCost);
            finance.addToFinanceExpense(types_1.FinanceType.Train, buyableRoute.train.id, 1, buyableRoute.trainCost);
        };
        /**
         * Remove Player expenses when reverting the purchase of Route and Train.
         *
         * @param {string}   routeId - String with id of Route to remove.
         * @param {string}   trainId - String with id of Train in Route.
         *
         * @return {boolean} True if removed from Finance else false.
         */
        this.handleRemoveRouteFromPlayerFinance = function (routeId, trainId) {
            var finance = _this._currentPlayer.getFinance();
            return (finance.removeFromFinanceExpense(types_1.FinanceType.Track, routeId) &&
                finance.removeFromFinanceExpense(types_1.FinanceType.Train, trainId));
        };
        /**
         * Get an object describing the gold and turn cost for a given Route with Upgrades taken into account.
         *
         * @param {number}   distance - String with id of Route to remove.
         *
         * @return {Object}             Object with gold and turn cost for a given distance
         */
        this.getPotentialRouteCost = function (distance) {
            var upgrades = _this._currentPlayer.getUpgrades();
            var valUp = upgrades.filter(function (upgrade) { return upgrade.type === types_1.UpgradeType.TrackValueCheaper; });
            var turnUp = upgrades.filter(function (upgrade) { return upgrade.type === types_1.UpgradeType.TurnCostCheaper; });
            var goldCost = distance * 2;
            var turnCost = util_1.getRangeTurnCost(distance);
            valUp.forEach(function (e) {
                var value = Math.floor(goldCost * e.value);
                if (goldCost - value < 10) {
                    goldCost = 10;
                }
                else {
                    goldCost -= value;
                }
            });
            turnUp.forEach(function (e) {
                if (turnCost >= 2) {
                    turnCost -= e.value;
                }
            });
            return {
                goldCost: goldCost,
                turnCost: turnCost ? turnCost : 1
            };
        };
        /**
         * Save the complete state of the game to localStorage.
         */
        this.saveGame = function () {
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.HasActiveGame], '1');
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Trains], btoa(JSON.stringify(_this.data.trains.map(function (e) { return e.deconstruct(); }))));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Resources], btoa(JSON.stringify(_this.data.resources.map(function (e) { return e.deconstruct(); }))));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Upgrades], btoa(JSON.stringify(_this.data.upgrades.map(function (e) { return e.deconstruct(); }))));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Cities], btoa(JSON.stringify(_this.data.cities.map(function (e) { return e.deconstruct(); }))));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Players], btoa(JSON.stringify(_this.players.map(function (e) { return e.deconstruct(); }))));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.CurrentPlayer], btoa(JSON.stringify(_this._currentPlayer.deconstruct())));
            window.localStorage.setItem(constants_1.localKeys[types_1.LocalKey.Turn], btoa('' + _this._turn));
        };
        this.players = players;
        this.data = gameData;
        this._currentPlayer = currentPlayer ? currentPlayer : this.players[0];
        this._turn = turn ? turn : 1;
    }
    /**
     * Get Nardis instance from saved localStorage data.
     *
     * @return {Nardis} Nardis instance recreated from localStorage.
     */
    Nardis.createFromLocalStorage = function () {
        if (!window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.HasActiveGame])) {
            throw new Error('cannot recreate from empty storage');
        }
        var trainsRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Trains])));
        var citiesRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Cities])));
        var resourcesRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Resources])));
        var upgradesRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Upgrades])));
        var playersRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Players])));
        var currentPlayerRaw = JSON.parse(atob(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.CurrentPlayer])));
        var trains = trainsRaw.map(function (trainString) { return train_1.default.createFromStringifiedJSON(trainString); });
        var upgrades = upgradesRaw.map(function (upgradeString) { return upgrade_1.default.createFromStringifiedJSON(upgradeString); });
        var resources = resourcesRaw.map(function (resourceString) { return resource_1.default.createFromStringifiedJSON(resourceString); });
        var cities = citiesRaw.map(function (cityString) { return city_1.default.createFromStringifiedJSON(cityString, resources); });
        var players = playersRaw.map(function (playerString) { return player_1.default.createFromStringifiedJSON(playerString, cities, trains, resources); });
        var currentPlayer = players.filter(function (player) { return player.id === currentPlayerRaw.id; })[0];
        var turn = parseInt(window.localStorage.getItem(constants_1.localKeys[types_1.LocalKey.Turn]));
        return new Nardis({
            trains: trains,
            upgrades: upgrades,
            resources: resources,
            cities: cities
        }, players, currentPlayer, turn);
    };
    return Nardis;
}());
exports.Nardis = Nardis;
