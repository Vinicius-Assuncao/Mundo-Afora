# 🌍 Mundo Afora

> 🧭 Planeje viagens dia a dia: paradas, trajetos, horários e mapas, com visual pensado para celular e desktop.

O **Mundo Afora** é uma aplicação web para montar roteiros de viagem. Você organiza a viagem em dias, adiciona os lugares que quer visitar, define horários e tempo de permanência e escolhe como se deslocar entre cada parada. O trajeto aparece no mapa, e a visão geral mostra o panorama de toda a viagem.

Tudo funciona no navegador e pode ser instalado no celular como aplicativo. Use sem conta, com os dados no próprio aparelho, ou entre com o Google para sincronizar suas viagens na nuvem.

---

## ✨ Funcionalidades

- 🏠 **Tela inicial** com as viagens ordenadas pela data de início e cartões com ícone, período e resumo
- 🌍 **Ícones personalizados** para cada viagem: emojis ou bandeiras de países
- 🗓️ **Período da viagem** definido por datas, com criação automática de um dia para cada data
- 🧭 **Visão geral** como tela inicial de cada viagem, com totais, cards dos dias e prévia das paradas
- 📍 **Paradas com foto e descrição** vindas da Wikipédia, quando disponíveis
- 🕒 **Horário e tempo de permanência** para cada parada, com aviso quando o horário não comporta o deslocamento
- 🚶 **Trajetos a pé, de bicicleta ou de carro**, com tempo e distância entre paradas
- 🔁 **Recálculo de trajetos** por dia ou da viagem inteira, para economizar requisições
- ↕️ **Ordenação manual** das paradas por arrastar, e transferência de paradas entre dias
- 💡 **Lista de ideias** para guardar lugares sem dia definido
- 🗺️ **Mapa** com as paradas numeradas, pré-visualização com foto e cinco estilos: Padrão, Limpo, Escuro, Satélite e Satélite híbrido
- 🎨 **Dez cores por dia** para organizar o roteiro visualmente
- 💾 **Exportação e importação** de viagens em JSON, para backup ou para outro aparelho
- 📱 **Layout responsivo** para celular e desktop e funcionamento offline dos mapas já visitados

---

## 🛠️ Tecnologias

- 🌐 **HTML5** para a estrutura das telas
- 🎨 **CSS3** com variáveis, layout em grid e flexbox
- ⚡ **JavaScript (ES6+)** puro, sem frameworks
- 🗺️ **Leaflet** para o mapa, com tiles do OpenStreetMap, CARTO e imagens de satélite do Esri
- ↕️ **SortableJS** para ordenar paradas por arrastar
- 🛣️ **OpenRouteService** para cálculo de trajetos
- 📍 **Nominatim** (OpenStreetMap) para busca de lugares
- ☁️ **Supabase** (banco PostgreSQL com autenticação e RLS) e login Google para sincronizar viagens
- 📖 **Wikipédia, Wikimedia Commons e Wikidata** para descrições e fotos dos lugares
- 🏳️ **FlagCDN** para as bandeiras
- 🔧 **Service Worker** para funcionamento offline

Não há dependências para instalar nem etapa de build.

---

## 🚀 Hospedagem

Aplicação estática, hospedada no GitHub Pages:

- https://vinicius-assuncao.github.io/Mundo-Afora/

---

## 🔗 Navegação por URL

A navegação usa hash routes e funciona diretamente no GitHub Pages:

- `#/viagens` abre a lista de viagens
- `#/Roma-2027` abre diretamente a viagem cujo nome gera esse slug

O histórico do navegador acompanha a navegação entre telas. Links de viagens podem ser copiados e abertos novamente no mesmo navegador, onde os dados locais estão armazenados.

## 🗄️ Armazenamento dos dados

Por padrão, as viagens ficam salvas no navegador do aparelho e o app funciona sem conta.

Com o login Google, as viagens também são guardadas no **Supabase**, vinculadas à sua conta, e aparecem em qualquer dispositivo onde você entrar. O aparelho mantém uma cópia local, então o roteiro continua disponível offline e é sincronizado quando a conexão volta.

Em caso de conflito (a mesma viagem alterada em dois aparelhos), vale a alteração mais recente.

Para backup ou para levar uma viagem a outro aparelho, use **Exportar** e **Importar roteiro**.

---

## 📁 Estrutura do projeto

```text
Mundo-Afora/
├── index.html          # Estrutura da aplicação
├── config.js           # Nome do app e chaves de serviços
├── css/
│   ├── base.css        # Tokens, componentes globais e cabeçalho
│   ├── home.css        # Tela inicial e cartões de viagem
│   ├── itinerary.css   # Roteiro, paradas, busca e ideias
│   ├── map.css         # Marcadores, tooltips e seletor de mapas
│   ├── dialogs.css     # Diálogos e feedback
│   └── responsive.css  # Regras responsivas
├── js/
│   ├── state.js        # Estado e utilitários
│   ├── services.js     # APIs e dados das atrações
│   ├── routing.js      # Cálculos de trajetos
│   ├── views.js        # Rotas e renderização das telas
│   ├── map.js          # Leaflet e estilos de mapa
│   ├── dialogs.js      # Diálogos, importação e exportação
│   └── events.js       # Eventos e inicialização
├── sw.js               # Cache e funcionamento offline
├── manifest.json      # Metadados para instalação no celular
├── icon.png            # Ícone do aplicativo
├── LICENSE             # MIT
└── README.md
```

---

## 👨‍💻 Autor

**Vinícius Assunção** 🎓

