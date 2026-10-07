/** A caller reserves its own range; this validates allocation, not custody. */
export function qualificationPorts(appPort, inspectorPort, range = process.env.QUAL_PORT_RANGE ?? '8700-8799') {
 const match = typeof range === 'string' && /^(\d+)-(\d+)$/.exec(range);
 if (!match) throw Error('QUAL_PORT_RANGE must be an explicit inclusive minimum-maximum range');
 const minimum = Number(match[1]), maximum = Number(match[2]);
 if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1024 || maximum > 65535 || minimum >= maximum) throw Error('Qualification port range must contain at least two unprivileged ports in 1024-65535');
 for (const port of [appPort, inspectorPort]) if (!Number.isInteger(port) || port < minimum || port > maximum) throw Error(`Explicit ports in ${minimum}-${maximum} required`);
 if (appPort === inspectorPort) throw Error('App and inspector ports must differ');
 return { minimum, maximum, appPort, inspectorPort };
}
