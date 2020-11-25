import City from './core/city';
import Route from './core/route';
import Upgrade from './core/player/upgrade';
import Player from './core/player/player';
import Train from './core/train';
import Resource from './core/resource';
import Finance from './core/player/finance';
import {
    GameData,
    HandleTurnInfo,
    PotentialRoute,
    BuyableRoute,
    FinanceType,
    UpgradeType,
    PlayerType,
    LocalKey
} from '../types/types';
import {
    localKeys
} from '../util/constants';
import {
    getRangeTurnCost
} from '../util/util';


/**
 * @constructor
 * @param {GameData} data          - Object with GameData.
 * @param {Player[]} players       - Array with Players.
 * 
 * @param {Player}   currentPlayer - (optional) Player instance of the current turn taker.
 * @param {number}   currentTurn   - (optional) Number describing the current turn.
 */

export class Nardis {

    readonly data         : GameData;
    readonly players      : Player[];

    private _currentPlayer: Player;
    private _turn         : number;


    constructor(
        gameData          : GameData,
        players           : Player[],
        currentPlayer    ?: Player,
        turn             ?: number
    ) {

        this.players        = players;
        this.data           = gameData;
        this._currentPlayer = currentPlayer ? currentPlayer : this.players[0];
        this._turn          = turn          ? turn          : 1;
    }

    public getCurrentPlayer = (): Player => this._currentPlayer;
    public getCurrentTurn   = (): number => this._turn;

    /**
     * Runs at the start of each turn cycle. One cycle is when every player in-game has ended their turn.
     */

    public startTurn = (): void => {
        const handleTurnInfo: HandleTurnInfo = {
            turn: this._turn, 
            data: this.data,
            playerData: {
                routes: this._currentPlayer.getRoutes(),
                upgrades: this._currentPlayer.getUpgrades()
            }
        };
        [...this.data.cities, ...this.data.resources, this._currentPlayer].forEach(turnComponent => {
            turnComponent.handleTurn(handleTurnInfo);
        });
    }

    /**
     * Runs when the Human player's turn is concluded. Then all Computer actions are handled in the turn.
     */

    public endTurn = (): void => {
        this.handleComputerTurn();
        this._turn++;
        this.saveGame();
    }

    /**
     * Get array of PotentialRoute objects respecting the current Players maximum range.
     * 
     * @param {City}              origin - City instance of initial departure
     * 
     * @return {PotentialRoute[]}          Array of PotentialRoutes
     */

    public getArrayOfPossibleRoutes = (origin: City): PotentialRoute[] => {
        const constraint: number = this._currentPlayer.getRange();
        const potentialRoutes: PotentialRoute[] = [];
        this.data.cities.forEach(city => {
            const distance: number = city.distanceTo(origin);
            const { goldCost, turnCost } = this.getPotentialRouteCost(distance);
            if (distance > 0 && distance <= constraint) {
                potentialRoutes.push({
                    cityOne: origin,
                    cityTwo: city,
                    distance: distance,
                    goldCost: goldCost,
                    turnCost: turnCost,
                    purchasedOnTurn: this._turn
                });
            }
        });
        return potentialRoutes;
    }

    /**
     * @return {{train: Train, cost: number}[]} Array of Trains with their cost adjusted to reflect potential Player Upgrades.
     */

    public getArrayOfAdjustedTrains = (): {train: Train, cost: number}[] => {
        const upgrades: Upgrade[] = this._currentPlayer.getUpgrades().filter(upgrade => upgrade.type === UpgradeType.TrainValueCheaper);
        return this.data.trains.map(train => {
            let cost: number = train.cost;
            upgrades.forEach(upgrade => {
                cost -= Math.floor(cost * upgrade.value);
            });
            return {
                train,
                cost
            };
        });
    }

    /**
     * @return {object} Object describing the current win state.
     */

    public hasAnyPlayerWon = (): {player: Player, hasWon: boolean} => {
        const result = this.players.filter(player => player.gold > 10000);
        return {
            player: result ? result[0] : null,
            hasWon: !!result
        };
    }

    /**
     * Add an entry to Player queue.
     * 
     * @param {BuyableRoute} buyableRoute - BuyableRoute to add.
     */

    public addRouteToPlayerQueue = (buyableRoute: BuyableRoute): void => {
        const route: Route = new Route(
            `${buyableRoute.cityOne.name} <--> ${buyableRoute.cityTwo.name}`,
            buyableRoute.cityOne,
            buyableRoute.cityTwo,
            buyableRoute.train,
            buyableRoute.routePlanCargo,
            buyableRoute.distance,
            buyableRoute.goldCost,
            buyableRoute.purchasedOnTurn
        );
        this.handleNewRoutePlayerFinance(buyableRoute, route.id);
        this._currentPlayer.addRouteToQueue(route, buyableRoute.turnCost);
    }

    /**
     * Add Upgrade to Player.
     * 
     * @param {string}   id - String with id of Upgrade to add.
     * 
     * @return {boolean} True if Upgrade was added else false.
     */

    public addUpgradeToPlayer = (id: string): boolean => {
        const matchedUpgrade: Upgrade[] = this.data.upgrades.filter(upgrade => upgrade.id === id);
        if (matchedUpgrade) {
            this._currentPlayer.addUpgrade(matchedUpgrade[0]);
            this._currentPlayer.getFinance().addToFinanceExpense(
                FinanceType.Upgrade,
                matchedUpgrade[0].id,
                1,
                matchedUpgrade[0].cost
            );
            return true;
        }
        return false;
    }

    /**
     * Remove an entry from Player queue.
     * 
     * @param {string}   routeId - String with id of Route to remove.
     * @param {string}   trainId - String with id of Train in Route.
     * 
     * @return {boolean} True if Route was removed from queue else false.
     */

    public removeRouteFromPlayerQueue = (routeId: string, trainId: string): boolean => {
        if (this._currentPlayer.removeRouteFromQueue(routeId)) {
            return this.handleRemoveRouteFromPlayerFinance(routeId, trainId);
        }
        return false;
    }

    /**
     * Clear the saved game state from localStorage.
     */

    public clearStorage = (): void => {
        localKeys.forEach(key => {
            window.localStorage.removeItem(key);
        });
    }

    /**
     * Iterate over each Computer player and handle their turns accordingly.
     */

    private handleComputerTurn = (): void => {
        const actualPlayer: Player = this._currentPlayer;
        this.players.forEach(player => {
            if (!(player.equals(this._currentPlayer)) && player.playerType === PlayerType.Computer) {
                this._currentPlayer = player;
                player.handleTurn(
                    {turn: this._turn, data: this.data, playerData: {
                        routes: player.getRoutes(), 
                        upgrades: player.getUpgrades()}
                    }
                );
            }
        });
        this._currentPlayer = actualPlayer;
    }

    /**
     * Handle Player expenses when purchasing a new Route and Train.
     * 
     * @param {BuyableRoute} buyableRoute - BuyableRoute object.
     * @param {string}       id           - String with id of the Route.
     */

    private handleNewRoutePlayerFinance = (buyableRoute: BuyableRoute, id: string): void => {
        const finance: Finance = this._currentPlayer.getFinance();
        finance.addToFinanceExpense(FinanceType.Track, id, 1, buyableRoute.goldCost);
        finance.addToFinanceExpense(FinanceType.Train, buyableRoute.train.id, 1, buyableRoute.trainCost);
    }

    /**
     * Remove Player expenses when reverting the purchase of Route and Train.
     * 
     * @param {string}   routeId - String with id of Route to remove.
     * @param {string}   trainId - String with id of Train in Route.
     * 
     * @return {boolean} True if removed from Finance else false.
     */

    private handleRemoveRouteFromPlayerFinance = (routeId: string, trainId: string): boolean => {
        const finance: Finance = this._currentPlayer.getFinance();
        return (
            finance.removeFromFinanceExpense(FinanceType.Track, routeId) &&
            finance.removeFromFinanceExpense(FinanceType.Train, trainId)
        );
    }

    /**
     * Get an object describing the gold and turn cost for a given Route with Upgrades taken into account.
     * 
     * @param {number}   distance - String with id of Route to remove.
     * 
     * @return {Object}             Object with gold and turn cost for a given distance
     */
 
    private getPotentialRouteCost = (distance: number): {goldCost: number, turnCost: number} => {
        const upgrades: Upgrade[] = this._currentPlayer.getUpgrades();
        const valUp: Upgrade[] = upgrades.filter(upgrade => upgrade.type === UpgradeType.TrackValueCheaper);
        const turnUp: Upgrade[] = upgrades.filter(upgrade => upgrade.type === UpgradeType.TurnCostCheaper);
        let goldCost: number = distance * 2;
        let turnCost: number = getRangeTurnCost(distance);
        valUp.forEach(e => {
            const value: number = Math.floor(goldCost * e.value);
            if (goldCost - value < 10) {
                goldCost = 10;
            } else {
                goldCost -= value;
            }
        });
        turnUp.forEach(e => {
            if (turnCost >= 2) {
                turnCost -= e.value;
            }
        });
        return {
            goldCost, 
            turnCost: turnCost ? turnCost : 1
        };
    }

    /**
     * Save the complete state of the game to localStorage.
     */

    private saveGame = (): void => {
        window.localStorage.setItem(
            localKeys[LocalKey.HasActiveGame], '1'
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Trains], btoa(JSON.stringify(this.data.trains.map(e => e.deconstruct())))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Resources], btoa(JSON.stringify(this.data.resources.map(e => e.deconstruct())))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Upgrades], btoa(JSON.stringify(this.data.upgrades.map(e => e.deconstruct())))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Cities], btoa(JSON.stringify(this.data.cities.map(e => e.deconstruct())))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Players], btoa(JSON.stringify(this.players.map(e => e.deconstruct())))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.CurrentPlayer], btoa(JSON.stringify(this._currentPlayer.deconstruct()))
        );
        window.localStorage.setItem(
            localKeys[LocalKey.Turn], btoa('' + this._turn)
        );
    }

    /**
     * Get Nardis instance from saved localStorage data.
     * 
     * @return {Nardis} Nardis instance recreated from localStorage.
     */

    public static createFromLocalStorage= (): Nardis => {
        if (!window.localStorage.getItem(localKeys[LocalKey.HasActiveGame])) {
            throw new Error('cannot recreate from empty storage');
        }

        const trainsRaw                 = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.Trains])
        ));
        const citiesRaw                 = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.Cities])
        ));
        const resourcesRaw              = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.Resources])
        ));
        const upgradesRaw               = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.Upgrades])
        ));
        const playersRaw                = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.Players])
        ));
        const currentPlayerRaw          = JSON.parse(atob(
            window.localStorage.getItem(localKeys[LocalKey.CurrentPlayer])
        ));

        const trains       : Train[]    = trainsRaw.map(
            trainString   => Train.createFromStringifiedJSON(trainString)
        );
        const upgrades     : Upgrade[]  = upgradesRaw.map(
            upgradeString => Upgrade.createFromStringifiedJSON(upgradeString)
        );
        const resources    : Resource[] = resourcesRaw.map(
            resourceString => Resource.createFromStringifiedJSON(resourceString)
        );
        const cities       : City[]     = citiesRaw.map(
            cityString => City.createFromStringifiedJSON(cityString, resources)
        );
        const players      : Player[]   = playersRaw.map(
            playerString => Player.createFromStringifiedJSON(playerString, cities, trains, resources)
        );
        const currentPlayer: Player     = players.filter(player => player.id === currentPlayerRaw.id)[0];
        const turn         : number     = parseInt(window.localStorage.getItem(localKeys[LocalKey.Turn]));

        return new Nardis(
            {
                trains,
                upgrades,
                resources,
                cities
            },
            players,
            currentPlayer,
            turn
        );
    }
}