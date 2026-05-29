/** Shared Socket.IO instance — allows REST handlers to emit events. */
let _io = null;

export const setIO = (io) => { _io = io; };
export const getIO = () => _io;
