import './tailwind.css';
import "tailwindcss-primeui";
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import App from './App.vue'
//import router from './router';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';


const app = createApp(App);
app.use(PrimeVue, {
    theme: {
        preset: Aura
    },

    locale: {
      emptySearchMessage: '未找到匹配项',
      emptyMessage: '暂无可选项'
    }
});

//app.use(router);
app.mount('#app');
