import {integrationRecipe} from './release/integration-recipe.mjs';
if (process.argv.length > 3 || !['--check', '--write'].includes(process.argv[2])) throw Error('Use --check or --write');
await integrationRecipe(process.cwd(), process.argv[2] === '--write');
console.log('Integration resource, migration and source identities match.');
