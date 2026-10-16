import { labels } from '@runeditrun/rer/local-installer';

// Base's browser installer keeps its app alive; the CLI's setup command stops
// its temporary app. Give that preparation step its own truthful status.
export function preparationLifecycle(lifecycle) {
  return {
    ...lifecycle,
    run(root, input, store, onApp, signal, options = {}) {
      if (options.verb !== 'setup') return lifecycle.run(root, input, store, onApp, signal, options);
      const setupStore = Object.create(store);
      setupStore.step = label => store.step(label === labels.complete
        ? 'Local setup is prepared. Run rer dev to start Slate.'
        : label);
      return lifecycle.run(root, input, setupStore, onApp, signal, options);
    },
  };
}
