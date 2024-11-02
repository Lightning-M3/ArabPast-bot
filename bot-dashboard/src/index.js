import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

// إنشاء كاش للـ RTL مع تجاهل source maps
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
  prepend: true,
  speedy: true, // تحسين الأداء
  insertionPoint: document.head.firstChild, // تحسين ترتيب CSS
  // تجاهل source maps
  map: false
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <CacheProvider value={cacheRtl}>
      <App />
    </CacheProvider>
  </React.StrictMode>
);
