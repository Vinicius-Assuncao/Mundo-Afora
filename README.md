# 🌍 Mundo Afora

> 🧭 Planeje viagens dia a dia: paradas, trajetos, horários e mapas, com visual pensado para celular e desktop.

O **Mundo Afora** é uma aplicação web para montar roteiros de viagem. Você organiza a viagem em dias, adiciona os lugares que quer visitar, define horários e tempo de permanência e escolhe como se deslocar entre cada parada. O trajeto aparece no mapa, e a visão geral mostra o panorama de toda a viagem.

Tudo funciona no navegador e pode ser instalado no celular como aplicativo. Os dados ficam salvos no próprio aparelho, sem necessidade de conta.

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
- 🗺️ **Mapa** com as paradas numeradas, pré-visualização com foto ao passar o cursor e alternância entre mapa e satélite
- 🎨 **Dez cores por dia** para organizar o roteiro visualmente
- 💾 **Exportação e importação** de viagens em JSON, para backup ou para outro aparelho
- 📱 **Layout responsivo** para celular e desktop e funcionamento offline dos mapas já visitados

---

## 🛠️ Tecnologias

- 🌐 **HTML5** para a estrutura das telas
- 🎨 **CSS3** com variáveis, layout em grid e flexbox
- ⚡ **JavaScript (ES6+)** puro, sem frameworks
- 🗺️ **Leaflet** para o mapa, com tiles do OpenStreetMap e imagens de satélite do Esri
- ↕️ **SortableJS** para ordenar paradas por arrastar
- 🛣️ **OpenRouteService** para cálculo de trajetos
- 📍 **Nominatim** (OpenStreetMap) para busca de lugares
- 📖 **Wikipédia** para descrições e fotos dos lugares
- 🏳️ **FlagCDN** para as bandeiras
- 🔧 **Service Worker** para funcionamento offline

Não há dependências para instalar nem etapa de build.

---

## 🚀 Hospedagem

Aplicação estática, hospedada no GitHub Pages:

- https://vinicius-assuncao.github.io/Mundo-Afora/

---

## 🗄️ Armazenamento dos dados

Os dados são salvos no `localStorage` do navegador. Não existe conta nem servidor próprio: cada aparelho guarda as próprias viagens.

Para transferir ou fazer backup de uma viagem, use **Exportar** na tela da viagem e **Importar viagem** na tela inicial. O arquivo gerado é um JSON legível.

---

## ⚙️ Configuração

O cálculo de trajetos usa a API do OpenRouteService. A chave é definida no arquivo `config.js`. Como o código é público, a chave deve ser restrita ao domínio da aplicação no painel do provedor.

Sem chave configurada, o roteiro funciona normalmente, mas os trajetos não são calculados.

---

## 📁 Estrutura do projeto

```text
Mundo-Afora/
├── index.html      # Telas: início, viagem e diálogo de criação e edição
├── style.css       # Estilos e layout responsivo
├── app.js          # Lógica: viagens, dias, paradas, trajetos, mapa e importação
├── config.js       # Nome do app e chave da API de trajetos
├── sw.js           # Service worker: cache e funcionamento offline
├── manifest.json   # Metadados para instalação no celular
├── icon.svg        # Ícone do aplicativo
├── LICENSE         # MIT
└── README.md
```

---

## 👨‍💻 Autor

**Vinícius Assunção** 🎓

