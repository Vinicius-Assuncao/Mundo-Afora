"""
Troca o nome do projeto em todos os lugares onde ele aparece.

Uso:
    python3 renomear.py "Nome do Projeto"
    python3 renomear.py "Nome do Projeto" "NomeCurto"   (opcional, nome curto do app)
"""
import json
import pathlib
import re
import sys
import unicodedata

if len(sys.argv) < 2:
    sys.exit('Informe o nome. Ex.: python3 renomear.py "Minha Rota"')

nome = sys.argv[1].strip()
curto = (sys.argv[2] if len(sys.argv) > 2 else nome).strip()[:12]

# slug para identificadores técnicos (cache do service worker)
slug = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-") or "app"

base = pathlib.Path(__file__).parent

# index.html: título da aba
html = base / "index.html"
html.write_text(re.sub(r"<title>.*?</title>", f"<title>{nome}</title>",
                       html.read_text(encoding="utf-8")), encoding="utf-8")

# manifest.json: nome que aparece ao instalar no celular
manifest = base / "manifest.json"
data = json.loads(manifest.read_text(encoding="utf-8"))
data["name"] = nome
data["short_name"] = curto
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# sw.js: nome do cache (troca a versão para forçar atualização)
sw = base / "sw.js"
sw.write_text(re.sub(r"const CACHE = '.*?';", f"const CACHE = '{slug}-v1';",
                     sw.read_text(encoding="utf-8")), encoding="utf-8")

# config.js: nome exibido dentro do app
cfg = base / "config.js"
cfg.write_text(re.sub(r"APP_NAME: '.*?'", f"APP_NAME: '{nome}'", cfg.read_text(encoding="utf-8")), encoding="utf-8")

# README: título
readme = base / "README.md"
linhas = readme.read_text(encoding="utf-8").splitlines()
linhas[0] = f"# {nome} (versão 1)"
readme.write_text("\n".join(linhas) + "\n", encoding="utf-8")

print(f"Nome atualizado para '{nome}' (curto: '{curto}', cache: '{slug}-v1').")
