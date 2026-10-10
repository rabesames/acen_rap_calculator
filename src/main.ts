import './styles.css';
import { browserStorage, createStore } from './state/store';
import { startApp } from './ui/app';

const root = document.getElementById('app');
if (root) startApp(root, createStore(browserStorage()));
