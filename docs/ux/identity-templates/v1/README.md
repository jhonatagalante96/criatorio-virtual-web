# V0-138 — Modelos iniciais de identidade visual

Versão da especificação: **1.0.0**

Esta pasta define a primeira versão dos modelos visuais usados para gerar a identidade do criatório sem upload de imagem própria.

## Decisões comuns

- Canvas canônico: **1024 × 1024 px** (1:1).
- Área segura: **96 px** em todos os lados.
- Saída recomendada de renderização: PNG 1024 × 1024, sRGB, fundo opaco.
- Preview pode ser entregue em SVG/PNG, mas a aplicação final deve persistir um asset rasterizado e imutável.
- Nenhum modelo depende de imagem, fonte, CDN ou biblioteca externa.
- Tipografia: stack de sistema (`Arial`, `Helvetica`, `sans-serif`).
- O nome vem do próprio criatório; não é um texto livre separado na configuração do modelo.
- A única personalização V1 exposta ao usuário é `variant`, limitada às opções declaradas pelo modelo.
- O backend deve rejeitar qualquer propriedade de configuração não declarada.
- A renderização deve ser determinística para `templateId + version + breederName + config`.

## Tratamento do nome do criatório

O renderizador deve aplicar as regras abaixo em todos os modelos:

1. Normalizar espaços consecutivos e remover espaços nas extremidades.
2. Preservar capitalização e acentos informados pelo usuário.
3. Tentar uma linha usando o tamanho máximo definido pelo modelo.
4. Se ultrapassar a largura útil, reduzir progressivamente o tamanho da fonte até o mínimo.
5. Persistindo o overflow, quebrar em no máximo duas linhas, preferindo limites entre palavras.
6. Persistindo o overflow no tamanho mínimo, truncar a segunda linha com reticências.
7. O nome nunca pode invadir a área segura ou elementos gráficos reservados.

Não há subtítulo obrigatório na V1. Ausência de dados opcionais não cria espaço vazio nem placeholders.

## Catálogo V1

### 1. Folhagem Clássica

- `templateId`: `folhagem-classica`
- Versão: `1.0.0`
- Estilo: institucional, claro e alinhado à marca do Criatório Virtual.
- Composição: símbolo botânico/pássaro centralizado, nome abaixo.
- Variantes: `brand`, `forest`.
- Uso recomendado: padrão mais neutro para documentos e crachás.

### 2. Selo do Criador

- `templateId`: `selo-criador`
- Versão: `1.0.0`
- Estilo: emblema circular, tradicional e compacto.
- Composição: aro duplo, símbolo central e nome na base do selo.
- Variantes: `brand`, `jade`.
- Uso recomendado: identidades que precisam funcionar bem em áreas pequenas.

### 3. Ramo Natural

- `templateId`: `ramo-natural`
- Versão: `1.0.0`
- Estilo: orgânico e leve.
- Composição: nome alinhado à esquerda com ramo e pássaro como elemento de apoio.
- Variantes: `natural`, `brand`.
- Uso recomendado: criatórios que preferem uma apresentação menos institucional.

### 4. Noturno Minimalista

- `templateId`: `noturno-minimalista`
- Versão: `1.0.0`
- Estilo: alto contraste, contemporâneo e reduzido.
- Composição: fundo escuro, monograma automático e símbolo simplificado.
- Variantes: `navy`, `forest-night`.
- O monograma é derivado automaticamente das primeiras letras significativas do nome e não é editável.
- Uso recomendado: identidade forte em cards e superfícies digitais.

## Regras de versão

- `templateId` é estável e nunca deve ser reutilizado para outro desenho.
- Ajustes que não alterem geometria, opções ou resultado visual perceptível podem ser patch (`1.0.x`).
- Alterações visuais compatíveis, novos valores de `variant` ou refinamentos que preservem o contrato são minor (`1.x.0`).
- Mudanças de composição, regras de texto, opções ou resultado incompatível exigem major (`2.0.0`).
- Identidades já aplicadas continuam apontando para a versão originalmente utilizada.
- Desativar um template apenas o remove de novas seleções; não invalida assets já aplicados.

## Contrato sugerido para V0-134 / V0-136

Exemplo de item de catálogo:

```json
{
  "id": "folhagem-classica",
  "name": "Folhagem Clássica",
  "version": "1.0.0",
  "previewUrl": "/assets/identity-templates/v1/folhagem-classica.svg",
  "aspectRatio": "1:1",
  "options": [
    {
      "key": "variant",
      "type": "enum",
      "required": true,
      "default": "brand",
      "values": ["brand", "forest"]
    }
  ]
}
```

Configuração enviada no preview/aplicação:

```json
{
  "templateId": "folhagem-classica",
  "version": "1.0.0",
  "config": {
    "variant": "brand"
  }
}
```

O nome do criatório deve ser obtido pelo backend a partir do criatório autenticado, evitando divergência entre preview/aplicação e o dado oficial.

## Acessibilidade e legibilidade

- Contraste mínimo alvo: WCAG AA para texto normal quando o modelo for exibido na interface.
- Nenhum significado depende apenas de cor.
- Previews devem usar `alt` com o nome do modelo e indicar que o texto exibido é demonstrativo.
- Em mobile, o preview deve continuar legível a partir de aproximadamente 160 px de largura.
- Elementos essenciais permanecem dentro da área segura de 96 px.

## Assets e licenciamento

Todos os previews V1 são SVGs autorais compostos apenas por formas vetoriais, cores da identidade do projeto e fontes de sistema. Não há dependências externas nem conteúdo de terceiros a licenciar.
