"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(res, data, status = 200) {
    return res.status(status).json({ ok: true, data });
}
function fail(res, message, status = 400, code) {
    return res.status(status).json({ ok: false, message, code });
}
