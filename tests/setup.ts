import { setLogLevel } from '../src/core/util/log';

setLogLevel(process.env.JWMERGE_LOG ? 'debug' : 'silent');
