# Mundo Afora (versão 1)

App de planejamento de viagens em HTML, CSS e JavaScript puros, instalável no celular (PWA).

## Arquivos

- `index.html`: telas (início, viagem e diálogo)
- `style.css`: design, responsivo para celular e desktop
- `app.js`: viagens, dias, paradas, trajetos, ideias, importar/exportar JSON, mapa
- `config.js`: nome do app e chave da API de trajetos
- `sw.js`: funcionamento offline (cache do app, mapas visitados e satélite)
- `manifest.json` e `icon.svg`: instalação no celular
- `renomear.py`: troca o nome do projeto em todos os lugares

## Chave da API de trajetos (OpenRouteService)

1. Crie uma chave gratuita em openrouteservice.org.
2. No painel, restrinja a chave ao seu domínio (ex.: `SEU-USUARIO.github.io`).
3. Cole a chave em `config.js`, no campo `ORS_KEY`.

Atenção: qualquer pessoa que abrir o site consegue ver a chave, por isso a restrição por domínio é importante.

## Publicar no GitHub Pages

1. Crie um repositório público e envie os arquivos para a raiz.
2. Em Settings > Pages, escolha a branch `main` e a pasta `/ (root)`.

## Trocar o nome

    python3 renomear.py "Nome do Projeto" "NomeCurto"

## Mapa por satélite

Usa as imagens do Esri (ArcGIS World Imagery), sem chave. Use o seletor de camadas no canto superior direito do mapa. Verifique os termos de uso do Esri antes de usar em produção ou com muitos acessos.
