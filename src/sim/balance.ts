export const LOT_W = 40;
export const LOT_H = 30;
export const ROAD_ROWS = 2;
export const MIN_PER_DAY = 1440;
export const START_MINUTE = 360;
export const SCENARIO_END_MINUTE = 7 * MIN_PER_DAY;

export const COST = {
  cell: 250,
  door: 6000,
  doorToggle: 500,
  rack: 1500,
  staging: 100,
  forklift: 8000,
  fastMast: 5000,
  repair: 500,
} as const;
export const WAGE_PER_FORKLIFT = 300;
export const RUNNING_PER_CELL = 15;
export const BUILD_MINUTES = 120;
export const FOOTPRINT = { minShort: 6, minLong: 8, maxLong: 36, maxShort: 24, minExpansion: 2, minSharedEdge: 2 } as const;
export const DOOR_APRON = 8;
export const TRUCK_STAGE_DIST = 4;
export const DOCK_OFFSET = 0.6;

export const FORKLIFT_SPEED = 0.8;
export const FAST_DRIVE = 1.15;
export const FAST_LIFT = 1.3;
export const HANDLE_MIN = 1;
export const FRAGILE_FACTOR = 1.5;
export const BLOCK_REPLAN_MIN = 3;
export const BLOCKED_MARKER_MIN = 10;

export const TRUCK_SPEED = 1.2;
export const DOCK_MIN = 5;
export const TRUCK_CAPACITY = 20;
export const TRUCK_GAP_MIN = 30;

export const START_CASH = 60000;
export const START_REP = 3;
export const WIN_NET_WORTH = 250000;
export const WIN_REP = 4;
export const LOSE_CASH = -20000;
export const LOSE_MINUTES = 24 * 60;

export const REP_ON_TIME = 0.1;
export const REP_LATE = -0.2;
export const REP_FAILED = -0.5;
export const FAIL_FEE = 2000;
export const LATE_PCT_PER_HOUR = 0.1;
export const FAIL_AFTER_LATE_MIN = 600;
export const OFFER_TTL = 720;
export const HOT_OFFER_TTL = 180;
export const EVENT_CHANCE_PER_HOUR = 1 / 6;
export const BREAKDOWN_MIN = 120;
export const MAX_EVENTS = 60;
export const FULL_ALERT_EVERY_MIN = 60;

/** Contract generation tuning. Ranges are inclusive [min, max]. */
export const OFFERS = {
  qtyDay1: [6, 12],
  qtyDay7: [30, 60],
  storageFeePerPallet: [80, 120],
  storageRent: [30, 50],
  storageDays: [1, 3],
  storageArriveHours: [2, 8],
  crossdockPerPallet: [250, 320],
  crossdockArriveHours: [2, 6],
  crossdockWindowMin: [240, 300],
  outboundBase: 150,
  outboundValuePct: 0.08,
  outboundArriveHours: [3, 8],
  pickupWindowMin: 360,
  outTruckDelayMin: 30,
} as const;
