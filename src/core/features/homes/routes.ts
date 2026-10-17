import { Hono } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { featureContext } from '../../app/feature-context';
import { parseInput } from '../databases/validation';
import { companyHubInput, containerHomeInput, setCompanyHub, setContainerHome } from './configuration';
import { companyHub, containerHome, homeChoices } from './queries';

export function createHomesRoutes() {
  return new Hono<AppEnvironment>()
    .get('/company-hub', async c => c.json(await companyHub(featureContext(c))))
    .put('/company-hub', async c => c.json(await setCompanyHub(featureContext(c), parseInput(companyHubInput, await c.req.json()))))
    .get('/choices', async c => c.json(await homeChoices(featureContext(c), c.req.query('containerId'))))
    .get('/containers/:id', async c => c.json(await containerHome(featureContext(c), c.req.param('id'))))
    .put('/containers/:id', async c => c.json(await setContainerHome(featureContext(c), c.req.param('id'), parseInput(containerHomeInput, await c.req.json()))));
}
