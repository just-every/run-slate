import { createRoot } from 'react-dom/client';
import { stories } from './stories';
import { TooltipProvider } from '../../src/core/ui';
import './styles.css';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme=query.get('theme')??'light';
const story = stories.find(item=>item.id===query.get('story'));
createRoot(document.getElementById('root')!).render(story ? <TooltipProvider><div>{story.render()}</div></TooltipProvider> : <main className="p-8"><h1>Slate component stories</h1><ul>{stories.map(item=><li key={item.id}><a href={`?story=${item.id}`}>{item.title}</a></li>)}</ul></main>);
