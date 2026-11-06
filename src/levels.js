import { LEVEL1 } from './level1.js';
import { LEVEL2 } from './level2.js';
import { LEVEL3 } from './level3.js';
import { LEVEL4 } from './level4.js';
import { LEVEL5 } from './level5.js';
import { LEVEL6 } from './level6.js';
import { LEVEL7 } from './level7.js';

// Every level that is built, in route order. The level selector lists them,
// grouped by topic (selector.js).
//
// A level is shown by its number within its topic, k ("Level 3" under
// Subtraction), set in its own file so it never changes when another level
// is added. Its build order, n, is what everything else goes by: the runs
// kept (record.js), its row's data-level, the browser tests' handles.
export const LEVELS = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7];

// A level as the breadcrumb and the finish screen name it: its topic and its
// number within it, "Subtraction 3".
export const levelName = level => `${level.topic} ${level.k}`;
