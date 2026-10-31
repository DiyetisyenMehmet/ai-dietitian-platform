"use strict";

// Retain legacy callable imports and modern named imports without old engines.
// All matching, parsing and defaults use unmodified upstream minimatch 11.0.1.
const engine = module.require("minimatch-engine");
module.exports = Object.assign(engine.minimatch, engine);
