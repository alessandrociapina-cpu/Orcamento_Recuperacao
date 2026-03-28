document.addEventListener('DOMContentLoaded', () => {
  const inputSelecionarFotos = document.getElementById('selecionarFotos');
  const galeriaPreview = document.getElementById('galeria-fotos-legenda');
  const btnGerarPDF = document.getElementById('btnGerarPDF');
  const canvasEditor = document.getElementById('canvasEditor');
  const ctxEditor = canvasEditor.getContext('2d');
  const modalEditor = document.getElementById('modalEditor');
  const modalCrop = document.getElementById('modalCrop');
  const inputBDI = document.getElementById('bdiGeral');
  const inputJustificativaBDI = document.getElementById('justificativaBdi');
  
  let fotosSelecionadas = [];
  let baseSinapi = [];
  let ferramentaAtual = 'seta';
  let isDrawing = false;
  let startX = 0, startY = 0;
  let historicoEdicao = []; 
  let lastStateImageData = null; 
  let fotoAtualEdicaoIndex = null;
  let cropperInstancia = null;
  let fotoAtualCropIndex = null;
  let assinaturaBase64 = null;

  // LEITURA MULTI-ARQUIVOS (Funde as 3 bases de dados)
  Promise.all([
      fetch('SINAPI_ATUALIZADO.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('SINPLAN_ATUALIZADO.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('SINAPI_MATERIAIS.json').then(r => r.ok ? r.json() : []).catch(() => [])
  ]).then(results => {
      baseSinapi = [...results[0], ...results[1], ...results[2]];
  });

  function normalizarTexto(texto) {
      return texto ? texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : "";
  }

  // =========================================================================
  // EXTRATORES INTELIGENTES MULTI-FORMATO
  // =========================================================================
  function getSinapiCodigo(item) {
      for (let k in item) {
          let key = k.toUpperCase();
          if (key.includes('CÓDIGO') || key.includes('CODIGO') || key === 'FIELD1') return item[k];
          if (key === 'SÃO PAULO' && item[k] && item[k].toString().includes('.SER')) return item[k]; // Regra do SINPLAN
      }
      return "S/C";
  }

  function getSinapiDescricao(item) {
      for (let k in item) {
          let key = k.toUpperCase();
          if (key.includes('DESCRIÇÃO') || key.includes('DESCRICAO') || key.includes('SINTÉTICA') || key === 'FIELD2') return item[k];
      }
      return "";
  }

  function getSinapiPreco(item) {
      for (let k in item) {
          let key = k.toUpperCase();
          if (key.includes('CUSTO') || key.includes('PREÇO') || key.includes('PRECO') || key === 'FIELD4' || key === 'SP') return item[k];
      }
      return 0;
  }

  function getSinapiUnidade(item) {
      for (let k in item) {
          let key = k.toUpperCase();
          if (key === 'UNIDADE' || key === 'UNID' || key === 'FIELD3') return item[k];
      }
      return "un";
  }

  function parsePreco(valorStr) {
      if (valorStr === null || valorStr === undefined || valorStr === "-") return 0;
      let cln = valorStr.toString().replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
      return parseFloat(cln) || 0;
  }

  // =========================================================================
  // ARQUITETURA DE DADOS AUDITÁVEL (Base Corrigida)
  // =========================================================================
  const ACABAMENTOS = {
      'none': { desc: 'Sem acabamento adicional', preco: 0, busca: '' },
      'pintura_latex': { desc: 'Emassamento e Pintura Látex', unid: 'm²', preco: 38.00, busca: 'pintura latex', codigoBase: '100717', tipoItem: 'servico' },
      'pintura_acrilica': { desc: 'Emassamento e Pintura Acrílica', unid: 'm²', preco: 48.00, busca: 'pintura acrilica', codigoBase: '100718', tipoItem: 'servico' },
      'textura': { desc: 'Aplicação de Selador e Textura Acrílica', unid: 'm²', preco: 58.00, busca: 'textura acrilica', codigoBase: '100719', tipoItem: 'servico' },
      'ceramica': { desc: 'Assentamento de Revestimento Cerâmico', unid: 'm²', preco: 92.00, busca: 'revestimento ceramico', codigoBase: '87248', tipoItem: 'servico' }
  };

  const TIPOLOGIAS = {
      TRINCA_PASSIVA_LEVE: {
          nome: "Trinca/Fissura Passiva (Superficial/Leve)",
          memorial: "1. Abertura de sulco superficial ao longo da diretriz da fissura (escarificação leve do revestimento).\n2. Limpeza enérgica com escova e ar comprimido para remoção de partículas soltas.\n3. Preenchimento do vão com argamassa polimérica ou resina epóxi de baixa viscosidade, visando a recomposição e estabilização superficial.\n4. Regularização da superfície (localizada) para posterior recebimento de acabamento.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Abertura de trinca/fissura superficial", unid: "m", precoUnit: 14.50, busca: "abertura trinca", codigoBase: "90400", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Preenchimento com argamassa polimérica de reparo (Localizado)", unid: "m", precoUnit: 3.98, busca: "FORCE_ARGAMASSA", codigoBase: "130", tipoItem: "insumo", regra: { tipo: 'fator', valor: 1.5, arredondamento: '2casas' } }
          ]
      },
      TRINCA_PASSIVA_ESTRUTURAL: {
          nome: "Trinca Passiva (Estrutural/Profunda) - CPU Analítica",
          memorial: "1. Abertura de vão em 'V' ao longo da diretriz da fissura e escarificação mecânica profunda do substrato.\n2. Limpeza enérgica com escova de aço e jato de ar comprimido para remoção do pó.\n3. Furação transversal e inserção de armadura em 'Z' (costura com 4 grampos de aço CA-50 por metro, a cada 25cm).\n4. Ancoragem dos grampos e pincelamento da cava com adesivo estrutural de base epóxi bicomponente.\n5. Preenchimento estrutural do vão com graute tixotrópico ou argamassa polimérica, visando o restabelecimento do monolitismo da peça.\n6. Chapisco e emboço localizado para regularização.\n\n* Justificativa de Consumo (Por metro linear):\n- Aço CA-50 (Ø 8,0mm): 4 grampos/m x 60cm/grampo x 0,395 kg/m = 0,95 kg/m.\n- Adesivo Epóxi: 4 grampos/m x 150g/grampo = 0,60 kg/m.\n- Graute Tixotrópico: Preenchimento do vão 'V' (3x3cm) e cobrimento = 3,00 kg/m.\n- Mão de Obra: Tempo de escarificação, furação, limpeza e chumbamento = 1,5h Pedreiro + 1,0h Servente.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Mão de Obra - Pedreiro com Encargos Complementares", unid: "h", precoUnit: 35.87, busca: "pedreiro com encargos", codigoBase: "88309", tipoItem: "servico", regra: { tipo: 'fator', valor: 1.5, arredondamento: '2casas' } },
              { desc: "Mão de Obra - Servente com Encargos Complementares", unid: "h", precoUnit: 31.15, busca: "servente com encargos", codigoBase: "88316", tipoItem: "servico", regra: { tipo: 'fator', valor: 1.0, arredondamento: '2casas' } },
              { desc: "Aço CA-50, Ø 8,0 mm, Vergalhão (Corte e Dobra manual)", unid: "kg", precoUnit: 6.55, busca: "FORCE_ACO", codigoBase: "33", tipoItem: "insumo", regra: { tipo: 'grampo_kg', espacamento: 0.25, peso: 0.395, arredondamento: '2casas' } },
              { desc: "Adesivo Estrutural à Base de Resina Epóxi, Pastoso", unid: "kg", precoUnit: 44.30, busca: "FORCE_EPOXI", codigoBase: "131", tipoItem: "insumo", regra: { tipo: 'grampo_adesivo', espacamento: 0.25, peso: 0.15, arredondamento: '2casas' } },
              { desc: "Argamassa Polimérica de Reparo Estrutural / Graute", unid: "kg", precoUnit: 3.98, busca: "FORCE_GRAUTE", codigoBase: "130", tipoItem: "insumo", regra: { tipo: 'fator', valor: 3.0, arredondamento: '2casas' } },
              { desc: "Lixa, disco de corte e brocas (Rateio/Desgaste)", unid: "un", precoUnit: 45.00, busca: "FORCE_DESGASTE", codigoBase: "3774", tipoItem: "insumo", regra: { tipo: 'fator', valor: 0.05, arredondamento: '2casas' } },
              { desc: "Chapisco e emboço para regularização (Localizado)", unid: "m²", precoUnit: 52.00, busca: "reboco argamassa", codigoBase: "87292", tipoItem: "servico", regra: { tipo: 'fator', valor: 0.5, arredondamento: '2casas' } }
          ]
      },
      TRINCA_ATIVA: {
          nome: "Trinca/Fissura Ativa (Movimentação Dinâmica)",
          memorial: "1. Abertura de sulco em 'V' com dimensões proporcionais à movimentação esperada.\n2. Limpeza e secagem rigorosa da base.\n3. Inserção de limitador de profundidade (tarugo de polietileno expandido) para evitar aderência no fundo da junta.\n4. Aplicação de primer e preenchimento integral com selante elastomérico flexível (PU).\n5. Colocação de tela de poliéster engastada na camada de acabamento (bandagem).\n6. Emassamento com massa acrílica flexível para dissipação de tensões longitudinais.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Abertura de junta/sulco em 'V' e limpeza", unid: "m", precoUnit: 22.00, busca: "abertura junta", codigoBase: "90400", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Aplicação de fundo de junta (tarugo de polietileno)", unid: "m", precoUnit: 5.50, busca: "fundo de junta", codigoBase: "4033", tipoItem: "insumo", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Selamento com mastique elastomérico (PU) e primer", unid: "m", precoUnit: 62.00, busca: "selante poliuretano", codigoBase: "98546", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Tratamento em 'sanduíche' com tela de poliéster e base coat", unid: "m", precoUnit: 35.00, busca: "tela poliester", codigoBase: "39474", tipoItem: "insumo", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Emassamento com massa acrílica elastomérica (Localizado)", unid: "m²", precoUnit: 42.00, busca: "massa acrilica", codigoBase: "98553", tipoItem: "servico", regra: { tipo: 'fator', valor: 0.5, arredondamento: '2casas' } }
          ]
      },
      UMIDADE_AGUA: {
          nome: "Manchas de Umidade (Vazamento de Água)",
          memorial: "1. Demolição do reboco e revestimento comprometido até a alvenaria nua, com margem de segurança de 30 a 50cm além da mancha visível.\n2. Limpeza da base.\n3. Aplicação de chapisco de aderência.\n4. Refazimento do emboço utilizando argamassa aditivada com impermeabilizante hidrófugo por cristalização.",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Demolição de reboco e limpeza de substrato (Localizado)", unid: "m²", precoUnit: 22.50, busca: "demolição reboco", codigoBase: "97622", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Chapisco de aderência (SINAPI/TCPO)", unid: "m²", precoUnit: 12.00, busca: "chapisco", codigoBase: "87878", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Reboco impermeável com aditivo hidrófugo", unid: "m²", precoUnit: 58.00, busca: "reboco impermeabilizante", codigoBase: "87529", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } }
          ]
      },
      UMIDADE_ESGOTO: {
          nome: "Contaminação e Umidade (Vazamento de Esgoto)",
          memorial: "1. Demolição profunda do revestimento contaminado (margem >50cm).\n2. Lavagem sanitizante com solução de hipoclorito de sódio a 5%, seguida de aplicação de biocida/fungicida para inibição de bolores.\n3. Chapisco de aderência.\n4. Novo reboco estrutural formulado com cimento resistente a sulfatos (RS).",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Demolição profunda de revestimento contaminado", unid: "m²", precoUnit: 30.00, busca: "demolição revestimento", codigoBase: "97622", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Lavagem sanitizante com hipoclorito de sódio a 5%", unid: "m²", precoUnit: 45.00, busca: "hipoclorito", codigoBase: "98544", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Chapisco com cimento resistente a sulfatos (RS)", unid: "m²", precoUnit: 18.00, busca: "chapisco", codigoBase: "87878", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Reboco estrutural com cimento RS", unid: "m²", precoUnit: 82.00, busca: "reboco cimento", codigoBase: "87292", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } }
          ]
      },
      CORROSAO_ARMADURA: {
          nome: "Corrosão de Armaduras / Desplacamento de Concreto",
          memorial: "1. Apicoamento/escarificação do concreto degradado até 2cm na retaguarda da armadura.\n2. Limpeza mecânica abrasiva do aço exposto até alcançar o grau ST3 (metal branco).\n3. Aplicação de primer anticorrosivo rico em zinco em 360º da barra afetada.\n4. Aplicação de ponte de aderência epóxi no substrato de concreto antigo.\n5. Recomposição rigorosa da seção geométrica com graute ou argamassa polimérica tixotrópica estrutural.",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Apicoamento/escarificação mecânica do concreto", unid: "m²", precoUnit: 110.00, busca: "apicoamento", codigoBase: "97644", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Primer anticorrosivo base zinco 360º na armadura", unid: "m²", precoUnit: 145.00, busca: "primer zinco", codigoBase: "100722", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Ponte de aderência estrutural à base de epóxi", unid: "m²", precoUnit: 85.00, busca: "ponte aderencia", codigoBase: "98547", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Recomposição com graute tixotrópico estrutural", unid: "m²", precoUnit: 190.00, busca: "graute tixotropico", codigoBase: "100724", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } }
          ]
      },
      RECALQUE_ESTACA_MEGA: {
          nome: "Recalque de Fundação (Reforço com Estaca Mega)",
          memorial: "1. Mobilização de equipamentos e monitoramento da estrutura.\n2. Escavação manual e escoramento para abertura de poço.\n3. Cravação de estacas mega de concreto por macacagem (comprimento estimado, a ser confirmado in loco por leitura de manômetro/nega).\n4. Encunhamento e concretagem do bloco de transição com cunhas metálicas.\n5. Tratamento localizado de rachaduras na alvenaria com técnica sanduíche.\n6. Recomposição arquitetônica (piso e pintura em pano inteiro) e remoção de entulho.",
          unidadeBase: "un", fatorArea: 1.0, 
          composicao: [
              { desc: "Mobilização de equipamento leve (Macaco Hidráulico)", unid: "un", precoUnit: 350.00, busca: "FORCE_MOBILIZACAO_MACACO", codigoBase: "MOB-01", tipoItem: "verba", regra: { tipo: 'fator', valor: 1, minimo: 1, arredondamento: 'ceil' } },
              { desc: "Escavação manual de vala para bloco/poço", unid: "un", precoUnit: 180.00, busca: "FORCE_ESCAVACAO_MANUAL", codigoBase: "93358", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: 'ceil' } },
              { desc: "Cravação de Estaca Mega de concreto (estimado 10m)", unid: "m", precoUnit: 320.00, busca: "FORCE_ESTACA_MEGA", codigoBase: "MEGA-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 10, arredondamento: '2casas' } },
              { desc: "Encunhamento com cunhas metálicas e graute de alta resistência", unid: "un", precoUnit: 950.00, busca: "FORCE_ENCUNHAMENTO_METALICO", codigoBase: "ENC-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: 'ceil' } },
              { desc: "Tratamento de rachaduras em 'sanduíche' c/ tela de poliéster e argamassa (Local)", unid: "m", precoUnit: 45.00, busca: "tratamento trincas", codigoBase: "39474", tipoItem: "servico", regra: { tipo: 'fator', valor: 3, arredondamento: '2casas' } },
              { desc: "Recomposição de contrapiso e piso cerâmico", unid: "m²", precoUnit: 150.00, busca: "contrapiso", codigoBase: "87248", tipoItem: "servico", regra: { tipo: 'fator', valor: 2, arredondamento: '2casas' } },
              { desc: "Emassamento e Pintura de Acabamento da Parede (Pano Inteiro)", unid: "m²", precoUnit: 38.00, busca: "pintura latex", codigoBase: "100717", tipoItem: "servico", regra: { tipo: 'fator', valor: 9, arredondamento: '2casas' } },
              { desc: "Remoção de entulho / Caçamba (rateio)", unid: "un", precoUnit: 401.00, busca: "caçamba", codigoBase: "32.109.000009.SER", tipoItem: "servico", regra: { tipo: 'fator', valor: 0.5, arredondamento: '2casas' } }
          ]
      },
      RECALQUE_EROSAO_PIPING: {
          nome: "Recalque por Erosão / Fuga de Material (Piping)",
          memorial: "1. Perfuração do contrapiso ou fundação para acesso aos vazios.\n2. Injeção sob pressão de calda de cimento ou concreto fluido para preenchimento da erosão e estabilização do solo carreável.",
          unidadeBase: "m³", fatorArea: 1.0,
          composicao: [
              { desc: "Furação mecanizada de laje/contrapiso p/ acesso", unid: "un", precoUnit: 35.00, busca: "furo", codigoBase: "FURO-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 2, arredondamento: 'ceil' } },
              { desc: "Injeção de calda de cimento/concreto fluido", unid: "m³", precoUnit: 680.00, busca: "calda de cimento", codigoBase: "INJ-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } }
          ]
      },
      ATAQUE_SULFATOS: {
          nome: "Ataque Químico por Sulfatos (Concreto)",
          memorial: "1. Demolição e apicoamento do concreto estrutural contaminado.\n2. Lavagem química e neutralização da base.\n3. Recomposição estrutural utilizando argamassa ou graute formulado com cimento Resistente a Sulfatos (RS).",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Apicoamento/escarificação do concreto", unid: "m²", precoUnit: 110.00, busca: "apicoamento", codigoBase: "97644", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Lavagem química preparatória", unid: "m²", precoUnit: 45.00, busca: "lavagem", codigoBase: "LAV-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } },
              { desc: "Recomposição com Graute Estrutural (Cimento RS)", unid: "m²", precoUnit: 220.00, busca: "graute", codigoBase: "GRT-01", tipoItem: "servico", regra: { tipo: 'fator', valor: 1, arredondamento: '2casas' } }
          ]
      }
  };

  // =========================================================================
  // SALVAMENTO E CARREGAMENTO DE PROJETO (CHAVE FORÇADA v83)
  // =========================================================================
  const STORAGE_KEY = 'projetoPatologiasSabesp_v83';
  let timeoutAutoSave;
  
  function autoSalvar() {
      const status = document.getElementById('statusAutoSave');
      status.style.color = '#ffc107';
      status.innerText = 'Aguardando para salvar...';

      clearTimeout(timeoutAutoSave);
      timeoutAutoSave = setTimeout(() => {
          try {
              const projeto = {
                  local: document.getElementById('localVistoria').value,
                  data: document.getElementById('dataVistoria').value,
                  hora: document.getElementById('horaVistoria').value,
                  fiscal: document.getElementById('nomeFiscal').value,
                  cargo: document.getElementById('cargoFiscal').value,
                  bdi: document.getElementById('bdiGeral').value,
                  justificativaBdi: document.getElementById('justificativaBdi').value,
                  assinatura: assinaturaBase64,
                  fotos: fotosSelecionadas
              };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(projeto));
              
              status.style.color = 'green';
              status.innerText = 'Projeto salvo automaticamente ✔';
              setTimeout(() => status.innerText = '', 3000);
          } catch(e) { console.error("Erro ao salvar", e); }
      }, 1500); 
  }

  function carregarDoLocalStorage() {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
          try {
              const p = JSON.parse(salvo);
              document.getElementById('localVistoria').value = p.local || '';
              document.getElementById('dataVistoria').value = p.data || '';
              document.getElementById('horaVistoria').value = p.hora || '';
              document.getElementById('nomeFiscal').value = p.fiscal || '';
              document.getElementById('cargoFiscal').value = p.cargo || 'Engenheiro Civil';
              document.getElementById('bdiGeral').value = p.bdi || '20.0';
              document.getElementById('justificativaBdi').value = p.justificativaBdi || 'Taxa padrão para recuperação com risco geológico e encargos';
              
              if(p.assinatura) {
                  assinaturaBase64 = p.assinatura;
                  document.getElementById('assinaturaStatus').style.display = 'inline-block';
                  document.getElementById('btnRemoverAssinatura').style.display = 'inline-block';
              }
              if(p.fotos && Array.isArray(p.fotos)) {
                  fotosSelecionadas = p.fotos;
                  renderizarInterface();
              }
          } catch(e) { console.error("Erro ao ler Auto-Save"); }
      } else {
          document.getElementById('bdiGeral').value = "20.0";
      }
  }
  
  carregarDoLocalStorage();

  document.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('change', autoSalvar);
  });

  document.getElementById('btnSalvarProjeto').onclick = () => {
      const projeto = {
          local: document.getElementById('localVistoria').value, data: document.getElementById('dataVistoria').value,
          hora: document.getElementById('horaVistoria').value, fiscal: document.getElementById('nomeFiscal').value,
          cargo: document.getElementById('cargoFiscal').value, bdi: document.getElementById('bdiGeral').value,
          justificativaBdi: document.getElementById('justificativaBdi').value, assinatura: assinaturaBase64, fotos: fotosSelecionadas
      };
      const blob = new Blob([JSON.stringify(projeto)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_Patologias_${document.getElementById('localVistoria').value || 'Projeto'}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  document.getElementById('inputCarregarProjeto').addEventListener('change', function(e) {
      if (!e.target.files[0]) return;
      const reader = new FileReader();
      reader.onload = function(event) {
          try {
              const p = JSON.parse(event.target.result);
              document.getElementById('localVistoria').value = p.local || '';
              document.getElementById('dataVistoria').value = p.data || '';
              document.getElementById('horaVistoria').value = p.hora || '';
              document.getElementById('nomeFiscal').value = p.fiscal || '';
              document.getElementById('cargoFiscal').value = p.cargo || 'Engenheiro Civil';
              document.getElementById('bdiGeral').value = p.bdi || '20.0';
              document.getElementById('justificativaBdi').value = p.justificativaBdi || '';
              
              if(p.assinatura) {
                  assinaturaBase64 = p.assinatura;
                  document.getElementById('assinaturaStatus').style.display = 'inline-block';
                  document.getElementById('btnRemoverAssinatura').style.display = 'inline-block';
              }
              if(p.fotos) { fotosSelecionadas = p.fotos; }
              renderizarInterface();
              autoSalvar();
          } catch(err) { alert("Arquivo de projeto inválido ou corrompido."); }
      };
      reader.readAsText(e.target.files[0]);
      e.target.value = '';
  });

  document.getElementById('btnNovoProjeto').onclick = () => {
      if(confirm("Tem certeza? Isso apagará todas as fotos e dados não salvos. Use isso para iniciar um projeto do zero e atualizar as bases de cálculo.")) {
          fotosSelecionadas = []; assinaturaBase64 = null;
          document.getElementById('form-vistoria').reset();
          document.getElementById('bdiGeral').value = "20.0";
          document.getElementById('assinaturaStatus').style.display = 'none';
          document.getElementById('btnRemoverAssinatura').style.display = 'none';
          renderizarInterface();
          localStorage.removeItem(STORAGE_KEY);
      }
  };

  // =========================================================================
  // GESTÃO DE IMAGENS E ARQUITETURA DE RASTREABILIDADE
  // =========================================================================
  inputSelecionarFotos.addEventListener('change', (e) => {
    const files = e.target.files;
    for(let file of files){
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const cvs = document.createElement('canvas');
                const ratio = img.width / img.height;
                cvs.width = Math.min(img.width, 1200);
                cvs.height = cvs.width / ratio;
                cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
                
                fotosSelecionadas.push({
                    id: Date.now() + Math.random(), preview: cvs.toDataURL('image/jpeg', 0.85), edited: null,
                    tipo: '', acabamento: 'none', medidaPrincipal: 1, itensAutomaticos: [], itensManuais: [], legenda: ''
                });
                renderizarInterface();
                autoSalvar();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
  });

  function processarRegraEBusca(c, m) {
      let qtdCalculada = m;
      let formulaTxt = "";

      if (c.regra.tipo === 'fator') {
          qtdCalculada = m * c.regra.valor;
          formulaTxt = `${m} x ${c.regra.valor} (Fator)`;
      } else if (c.regra.tipo === 'teto_grampo') {
          qtdCalculada = Math.ceil(m / c.regra.espacamento);
          formulaTxt = `Arred.Teto(${m} / ${c.regra.espacamento})`;
      } else if (c.regra.tipo === 'grampo_kg') {
          qtdCalculada = Math.ceil(m / c.regra.espacamento) * c.regra.peso;
          formulaTxt = `Arred.Teto(${m} / ${c.regra.espacamento}) x ${c.regra.peso} kg`;
      } else if (c.regra.tipo === 'grampo_adesivo') {
          qtdCalculada = Math.ceil(m / c.regra.espacamento) * c.regra.peso;
          formulaTxt = `Arred.Teto(${m} / ${c.regra.espacamento}) x ${c.regra.peso} kg`;
      }

      if (c.regra.arredondamento === 'ceil') {
          qtdCalculada = Math.ceil(qtdCalculada);
      } else if (c.regra.arredondamento === 'inteiro') {
          qtdCalculada = Math.round(qtdCalculada);
      }
      
      if (c.regra.minimo !== undefined && qtdCalculada < c.regra.minimo) {
          qtdCalculada = c.regra.minimo;
          formulaTxt += ` (Mínimo adotado: ${c.regra.minimo})`;
      }

      // Motor de Busca Seguro com Trava Anti-Alucinação para Insumos (V83)
      let preco = c.precoUnit;
      let desc = c.desc;
      let fontePreco = "Tabela Interna (Fallback)";
      let codigoEfetivo = c.codigoBase || "S/C";

      if (baseSinapi.length > 0 && !c.busca.startsWith('FORCE_')) {
          let s = null;
          // Tenta a busca 100% segura por Código primeiro
          if (c.codigoBase) {
              s = baseSinapi.find(i => getSinapiCodigo(i) == c.codigoBase);
          }
          
          // Se não achar por código, e NÃO FOR INSUMO, procura por texto.
          // Insumos estão travados para não buscarem textos aleatórios (ex: Guarda-corpo).
          if (!s && c.tipoItem !== 'insumo') {
              const termoNorm = normalizarTexto(c.busca);
              s = baseSinapi.find(i => normalizarTexto(getSinapiDescricao(i)).includes(termoNorm));
          }
          
          if (s) { 
              let precoS = getSinapiPreco(s);
              if(precoS !== "-" && precoS !== "") {
                  preco = parsePreco(precoS); 
              }
              desc = getSinapiDescricao(s); 
              fontePreco = "SINAPI/SINPLAN";
              codigoEfetivo = getSinapiCodigo(s);
          }
      }

      return { qtdCalculada: parseFloat(qtdCalculada.toFixed(2)), formulaTxt, preco, desc, fontePreco, codigoEfetivo };
  }

  function reconstruirComposicao(foto) {
      if (!foto.tipo || !TIPOLOGIAS[foto.tipo]) return;
      const m = foto.medidaPrincipal;
      
      const estadoAnterior = {};
      if (foto.itensAutomaticos) {
          foto.itensAutomaticos.forEach(it => { estadoAnterior[it.idRef] = it; });
      }

      foto.itensAutomaticos = [];
      
      TIPOLOGIAS[foto.tipo].composicao.forEach((c, index) => {
          const idRef = `auto_${foto.tipo}_${index}`;
          const anterior = estadoAnterior[idRef];

          if (anterior && anterior.removido) return;

          const res = processarRegraEBusca(c, m);
          
          let qtdAdotada = res.qtdCalculada;
          let editado = false;
          let modo = 'localizado';
          let descFinal = res.desc;

          if (anterior && anterior.editadoManualmente) {
              qtdAdotada = anterior.qtdAdotada;
              editado = true;
              modo = anterior.modo || 'localizado';
              descFinal = anterior.desc;
          }

          foto.itensAutomaticos.push({
              idRef: idRef, origem: 'automatico', categoria: c.tipoItem, modo: modo,
              desc: descFinal, unid: c.unid, qtdAdotada: qtdAdotada, preco: res.preco,
              formula: res.formulaTxt, editadoManualmente: editado, removido: false,
              codigoEfetivo: res.codigoEfetivo, fontePreco: res.fontePreco, precoRef: res.preco
          });
      });

      if (foto.acabamento && foto.acabamento !== 'none') {
          const a = ACABAMENTOS[foto.acabamento];
          const idRef = `auto_acab_01`;
          const anterior = estadoAnterior[idRef];

          if (!(anterior && anterior.removido)) {
              const cAcab = { desc: a.desc, unid: a.unid, precoUnit: a.preco, busca: a.busca, codigoBase: a.codigoBase, tipoItem: a.tipoItem, regra: { tipo: 'fator', valor: TIPOLOGIAS[foto.tipo].fatorArea, arredondamento: '2casas' } };
              const res = processarRegraEBusca(cAcab, m);

              let qtdAdotada = res.qtdCalculada;
              let editado = false;
              let modo = 'localizado';
              let descFinal = res.desc;

              if (anterior && anterior.editadoManualmente) {
                  qtdAdotada = anterior.qtdAdotada;
                  editado = true;
                  modo = anterior.modo || 'localizado';
                  descFinal = anterior.desc;
              }

              foto.itensAutomaticos.push({
                  idRef: idRef, origem: 'automatico', categoria: 'acabamento', modo: modo,
                  desc: descFinal, unid: a.unid, qtdAdotada: qtdAdotada, preco: res.preco,
                  formula: res.formulaTxt, editadoManualmente: editado, removido: false,
                  codigoEfetivo: res.codigoEfetivo, fontePreco: res.fontePreco, precoRef: res.preco
              });
          }
      }
  }

  function atualizarTotaisNoDOM() {
      let totalDiretoGlobal = 0;
      let resumoHtml = `<h4 style="margin: 0 0 10px 0; color: #555;">Subtotais Diretos por Patologia:</h4><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9em; color: #333;">`;

      fotosSelecionadas.forEach((foto, idx) => {
          let subtotalPatologia = 0;
          const itensRender = [...(foto.itensAutomaticos || []).filter(i => !i.removido), ...(foto.itensManuais || [])];
          
          itensRender.forEach((item, itemIdx) => {
              let totalItem = item.qtdAdotada * item.preco;
              subtotalPatologia += totalItem;

              const celulaTotalItem = document.getElementById(`totalItem-${idx}-${itemIdx}`);
              if (celulaTotalItem) celulaTotalItem.innerText = `R$ ${totalItem.toFixed(2).replace('.',',')}`;
              
              const inputQtd = document.getElementById(`qtd-${idx}-${itemIdx}`);
              if (inputQtd && document.activeElement !== inputQtd) inputQtd.value = item.qtdAdotada;
          });

          totalDiretoGlobal += subtotalPatologia;
          const celulaSubtotal = document.getElementById(`subtotal-${idx}`);
          if (celulaSubtotal) celulaSubtotal.innerText = `R$ ${subtotalPatologia.toFixed(2).replace('.',',')}`;

          if (foto.tipo) {
              resumoHtml += `<li style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 4px 0;">
                <span>Patologia 0${idx + 1} - ${TIPOLOGIAS[foto.tipo].nome}</span>
                <strong>R$ ${subtotalPatologia.toFixed(2).replace('.',',')}</strong>
              </li>`;
          }
      });

      let taxaBdi = parseFloat(inputBDI.value) || 0;
      let valorBdi = totalDiretoGlobal * (taxaBdi / 100);
      let totalComBdi = totalDiretoGlobal + valorBdi;

      resumoHtml += `</ul>
        <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 1.1em; color: #000; border-top: 1px solid #ccc; padding-top: 5px;">
            <span>Soma dos Custos Diretos:</span>
            <strong>R$ ${totalDiretoGlobal.toFixed(2).replace('.',',')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 1em; color: #12D0FF;">
            <span>BDI Aplicado (${taxaBdi}%):</span>
            <strong>+ R$ ${valorBdi.toFixed(2).replace('.',',')}</strong>
        </div>
      `;

      document.getElementById('resumo-tela-subtotais').innerHTML = resumoHtml;
      document.getElementById('valor-total-tela').innerText = `R$ ${totalComBdi.toFixed(2).replace('.',',')}`;
  }

  window.calcularPanoInteiro = function(idx) {
      const f = fotosSelecionadas[idx];
      if (!f.acabamento || f.acabamento === 'none') {
          alert('Por favor, selecione um Acabamento de Superfície antes de calcular o Pano Inteiro.');
          return;
      }
      let area = prompt("Informe a área total (m²) da parede para o Pano Inteiro:");
      if (area) {
          area = parseFloat(area.replace(',', '.'));
          if (!isNaN(area) && area > 0) {
              const itemAcab = f.itensAutomaticos.find(it => it.categoria === 'acabamento' && !it.removido);
              if (itemAcab) {
                  itemAcab.qtdAdotada = area;
                  itemAcab.editadoManualmente = true;
                  itemAcab.modo = 'pano_inteiro';
                  if(!itemAcab.desc.includes('Pano Inteiro')) {
                      itemAcab.desc = itemAcab.desc + " (Pano Inteiro)";
                  }
                  renderizarInterface();
                  autoSalvar();
              }
          }
      }
  };

  function renderizarInterface() {
    galeriaPreview.innerHTML = '';

    fotosSelecionadas.forEach((foto, idx) => {
      const card = document.createElement('div');
      card.className = 'card-patologia';
      const tituloMedidaT = foto.tipo ? ` - ${foto.medidaPrincipal} ${TIPOLOGIAS[foto.tipo].unidadeBase}` : '';
      
      const itensRender = [...(foto.itensAutomaticos || []).filter(i => !i.removido), ...(foto.itensManuais || [])];

      let html = `
        <div class="card-col-esq">
            <h3 style="margin-top:0; color:#12D0FF; text-align:left; font-family:Tahoma, sans-serif;">Patologia 0${idx + 1}${tituloMedidaT}</h3>
            <img src="${foto.edited || foto.preview}" style="max-width:100%; max-height:250px; display:block; margin:auto; border-radius:4px; border:1px solid #ccc;">
            <div style="margin-top:10px; display:flex; gap:5px; flex-wrap:wrap; justify-content:center;">
                <button class="botao-secundario" onclick="abrirEditor(${idx})" style="flex:1 1 45%; padding:8px;">✏️ Desenhar</button>
                <button class="botao-secundario" onclick="abrirCrop(${idx})" style="flex:1 1 45%; padding:8px;">✂️ Recortar</button>
                <button class="botao-secundario" onclick="removerFoto(${idx})" style="flex:1 1 100%; background:#d9534f; color:#fff; padding:8px; border:none;">✖ Excluir Foto</button>
            </div>
        </div>
        
        <div class="card-col-dir">
            <label style="font-weight:bold; color: #555;">Tipologia Técnica:</label>
            <select onchange="mudarTipologia(${idx}, this.value)" style="width:100%;">
                <option value="">Selecione a Patologia...</option>
                ${Object.keys(TIPOLOGIAS).map(k => `<option value="${k}" ${foto.tipo === k ? 'selected' : ''}>${TIPOLOGIAS[k].nome}</option>`).join('')}
            </select>
            ${foto.tipo ? `
                <div style="display:flex; gap:10px; flex-wrap:wrap; background:#eef2f5; padding:10px; border-radius:4px;">
                    <div style="flex:1; min-width: 120px;">
                        <label style="font-weight:bold; font-size:0.9em;">Medida (${TIPOLOGIAS[foto.tipo].unidadeBase}):</label>
                        <input type="number" step="0.01" value="${foto.medidaPrincipal}" oninput="atualizarMedida(${idx}, this.value)">
                    </div>
                    <div style="flex:2; min-width: 180px;">
                        <label style="font-weight:bold; font-size:0.9em;">Acabamento de Superfície:</label>
                        <div style="display:flex; gap:5px;">
                            <select onchange="mudarAcabamento(${idx}, this.value)" style="flex:1;">
                                ${Object.keys(ACABAMENTOS).map(k => `<option value="${k}" ${foto.acabamento === k ? 'selected' : ''}>${ACABAMENTOS[k].desc}</option>`).join('')}
                            </select>
                            <button type="button" onclick="calcularPanoInteiro(${idx})" class="botao-secundario" style="padding: 0 10px; font-size: 0.8em; margin:0;" title="Aplicar acabamento em toda a parede">🖌️ Pano Inteiro</button>
                        </div>
                    </div>
                </div>
            ` : ''}
            <div class="tabela-wrapper">
                <table class="tabela-modular">
                    <thead><tr><th>Serviço da Base (Auditoria)</th><th>Und</th><th>Qtd</th><th>Unit</th><th>Total</th><th>✖</th></tr></thead>
                    <tbody>
                        ${itensRender.map((it, iIdx) => `
                            <tr>
                                <td style="font-size:0.85em;">
                                    ${it.editadoManualmente ? '<span title="Qtde editada manualmente" style="color:#d9534f;">✏️ </span>' : ''}
                                    <span style="color:#12D0FF; font-weight:bold;" title="Fonte: ${it.fontePreco}">[${it.codigoEfetivo}]</span> ${it.desc}
                                </td>
                                <td style="text-align:center;">${it.unid}</td>
                                <td><input type="number" id="qtd-${idx}-${iIdx}" step="0.01" value="${it.qtdAdotada}" oninput="atualizarQtdItem(${idx}, '${it.origem}', '${it.idRef}', this.value)"></td>
                                <td style="text-align:right;">R$ ${it.preco.toFixed(2).replace('.',',')}</td>
                                <td id="totalItem-${idx}-${iIdx}" style="text-align:right; font-weight:bold;">R$ ${(it.qtdAdotada * it.preco).toFixed(2).replace('.',',')}</td>
                                <td style="text-align:center;"><button onclick="removerItem(${idx}, '${it.origem}', '${it.idRef}')" style="color:red; border:none; background:none; cursor:pointer;">✖</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot><tr style="background:#f8f9fa;"><td colspan="4" style="text-align:right; font-weight:bold;">Subtotal Direto:</td><td id="subtotal-${idx}" style="font-weight:bold; color:#12D0FF; text-align:right;">R$ 0,00</td><td></td></tr></tfoot>
                </table>
            </div>
            <div style="border: 1px dashed #bbb; padding: 10px; margin-top: 5px; background: #fafafa; border-radius: 4px;">
                <span style="font-weight:bold; font-size: 0.9em; color:#555;">➕ Incluir Serviço Adicional ou Preliminar:</span>
                <div style="margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap;">
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Caçamba de Entulho (5m³)', 'un', 401.00, 'servico', '32.109.000009.SER')">+ Caçamba</button>
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Andaime Fachadeiro/Tubular (m²xMês)', 'm²', 25.00, 'equipamento', '10041')">+ Andaime</button>
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Emissão de ART / Laudo Técnico', 'un', 350.00, 'verba', 'ART-01')">+ ART</button>
                </div>
                <div class="busca-sinapi-local" style="margin-top: 8px;">
                    <input type="text" id="busca-${idx}" placeholder="Buscar no SINAPI..." onkeyup="pesquisarSinapi(event, ${idx})">
                    <select id="resultado-${idx}"><option value="">Aguardando busca...</option></select>
                    <button onclick="adicionarSinapiNaPatologia(${idx})" style="background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">Inserir</button>
                </div>
            </div>
            <textarea placeholder="Observações para o laudo..." oninput="atualizarLegenda(${idx}, this.value)" style="min-height: 60px;">${foto.legenda}</textarea>
        </div>`;
      card.innerHTML = html;
      galeriaPreview.appendChild(card);
    });
    atualizarTotaisNoDOM();
  }

  window.mudarTipologia = (idx, v) => { fotosSelecionadas[idx].tipo = v; reconstruirComposicao(fotosSelecionadas[idx]); renderizarInterface(); autoSalvar(); };
  window.mudarAcabamento = (idx, v) => { fotosSelecionadas[idx].acabamento = v; reconstruirComposicao(fotosSelecionadas[idx]); renderizarInterface(); autoSalvar(); };
  window.atualizarMedida = (idx, v) => { fotosSelecionadas[idx].medidaPrincipal = parseFloat(v) || 0; reconstruirComposicao(fotosSelecionadas[idx]); atualizarTotaisNoDOM(); autoSalvar(); };
  window.removerFoto = (idx) => { fotosSelecionadas.splice(idx, 1); renderizarInterface(); autoSalvar(); };
  
  window.atualizarQtdItem = (idxFoto, origem, idRef, val) => { 
      const f = fotosSelecionadas[idxFoto];
      const qtd = parseFloat(val) || 0;
      if (origem === 'automatico') {
          const it = f.itensAutomaticos.find(i => i.idRef === idRef);
          if (it) { it.qtdAdotada = qtd; it.editadoManualmente = true; }
      } else {
          const it = f.itensManuais.find(i => i.idRef === idRef);
          if (it) { it.qtdAdotada = qtd; }
      }
      atualizarTotaisNoDOM(); 
      autoSalvar(); 
  };
  
  window.removerItem = (idxFoto, origem, idRef) => { 
      const f = fotosSelecionadas[idxFoto];
      if (origem === 'automatico') {
          const it = f.itensAutomaticos.find(i => i.idRef === idRef);
          if (it) it.removido = true;
      } else {
          f.itensManuais = f.itensManuais.filter(i => i.idRef !== idRef);
      }
      renderizarInterface(); 
      autoSalvar(); 
  };
  
  window.atualizarLegenda = (idx, texto) => { fotosSelecionadas[idx].legenda = texto; autoSalvar(); };

  window.adicionarItemRapido = function(idxFoto, desc, unid, precoBase, tipoItem = 'servico', codigoBase = 'MANUAL') {
      if(!fotosSelecionadas[idxFoto].itensManuais) fotosSelecionadas[idxFoto].itensManuais = [];
      fotosSelecionadas[idxFoto].itensManuais.push({ 
          idRef: 'man_' + Date.now() + Math.random(), 
          origem: 'manual', categoria: tipoItem, desc: desc, unid: unid, qtdAdotada: 1, preco: precoBase, 
          formula: 'Inserção Manual', codigoEfetivo: codigoBase, fontePreco: 'Interna', precoRef: precoBase
      });
      renderizarInterface();
      autoSalvar();
  };

  window.pesquisarSinapi = function(event, idxFoto) {
      const termo = normalizarTexto(event.target.value);
      const select = document.getElementById(`resultado-${idxFoto}`);
      select.innerHTML = '';
      if(termo.length < 3) { select.innerHTML = '<option value="">Digite 3 letras...</option>'; return; }
      
      const resultados = baseSinapi.filter(i => {
          const d = getSinapiDescricao(i);
          return d && normalizarTexto(d).includes(termo);
      }).slice(0, 40);
      
      if(resultados.length === 0) { select.innerHTML = '<option value="">Nada encontrado.</option>'; return; }

      resultados.forEach(item => {
          const desc = getSinapiDescricao(item);
          const preco = parsePreco(getSinapiPreco(item));
          const unid = getSinapiUnidade(item);
          const codigo = getSinapiCodigo(item);
          
          const opt = document.createElement('option');
          opt.value = JSON.stringify({ desc, unid, preco, codigo });
          opt.text = `[${codigo}] ${desc.substring(0,50)}... | ${unid} | R$ ${preco.toFixed(2)}`;
          select.appendChild(opt);
      });
  };

  window.adicionarSinapiNaPatologia = function(idxFoto) {
      const select = document.getElementById(`resultado-${idxFoto}`);
      if (!select.value || select.value.startsWith('Aguardando') || select.value.startsWith('Nenhum') || select.value.startsWith('Digite')) return;
      const dadosItem = JSON.parse(select.value);
      if(!fotosSelecionadas[idxFoto].itensManuais) fotosSelecionadas[idxFoto].itensManuais = [];
      fotosSelecionadas[idxFoto].itensManuais.push({ 
          idRef: 'man_' + Date.now() + Math.random(),
          origem: 'manual', categoria: 'servico', desc: dadosItem.desc, unid: dadosItem.unid, 
          qtdAdotada: 1, preco: dadosItem.preco, formula: 'Inserção Manual / Busca',
          codigoEfetivo: dadosItem.codigo, fontePreco: 'SINAPI', precoRef: dadosItem.preco
      });
      renderizarInterface();
      autoSalvar();
  };

  // =========================================================================
  // MOTOR DO CANVAS E CROPPER (MODAIS FLUTUANTES)
  // =========================================================================
  window.abrirEditor = (idx) => {
      fotoAtualEdicaoIndex = idx;
      const img = new Image();
      img.onload = () => {
          canvasEditor.width = img.width; canvasEditor.height = img.height;
          ctxEditor.drawImage(img, 0, 0);
          historicoEdicao = [canvasEditor.toDataURL()];
          document.getElementById('modalEditor').classList.remove('modal-oculto');
      };
      img.src = fotosSelecionadas[idx].edited || fotosSelecionadas[idx].preview;
  };

  document.querySelectorAll('input[name="ferramentaEdicao"]').forEach(r => {
      r.addEventListener('change', (e) => {
          ferramentaAtual = e.target.value;
          const t = document.getElementById('textoEdicao');
          t.style.display = (ferramentaAtual === 'texto' || ferramentaAtual === 'regua') ? 'inline-block' : 'none';
          t.placeholder = ferramentaAtual === 'regua' ? "Ex: 2.5m" : "Digite o texto aqui...";
      });
  });

  function getPos(e) {
      const r = canvasEditor.getBoundingClientRect();
      const sx = canvasEditor.width / r.width, sy = canvasEditor.height / r.height;
      let cx = e.clientX, cy = e.clientY;
      if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
      return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
  }

  function inciarDesenho(e) {
      if (e.cancelable) e.preventDefault();
      const p = getPos(e);
      if (ferramentaAtual === 'texto') {
          const txt = document.getElementById('textoEdicao').value.trim();
          if (txt) {
              ctxEditor.font = `bold ${Math.max(20, canvasEditor.width * 0.04)}px Tahoma, Arial`;
              ctxEditor.fillStyle = 'red'; ctxEditor.strokeStyle = 'white'; ctxEditor.lineWidth = 2;
              ctxEditor.strokeText(txt, p.x, p.y); ctxEditor.fillText(txt, p.x, p.y);
              historicoEdicao.push(canvasEditor.toDataURL());
          }
          return;
      }
      isDrawing = true; startX = p.x; startY = p.y;
      lastStateImageData = ctxEditor.getImageData(0, 0, canvasEditor.width, canvasEditor.height);
  }

  function moverDesenho(e) {
      if (!isDrawing) return;
      if (e.cancelable) e.preventDefault();
      const p = getPos(e);
      ctxEditor.putImageData(lastStateImageData, 0, 0);
      ctxEditor.lineWidth = Math.max(4, canvasEditor.width * 0.008);
      const ang = Math.atan2(p.y - startY, p.x - startX);
      
      if (ferramentaAtual === 'seta') {
          ctxEditor.strokeStyle = 'red'; ctxEditor.fillStyle = 'red';
          const tPonta = Math.max(15, canvasEditor.width * 0.03);
          ctxEditor.beginPath(); ctxEditor.moveTo(startX, startY); ctxEditor.lineTo(p.x, p.y);
          ctxEditor.lineTo(p.x - tPonta * Math.cos(ang - 0.5), p.y - tPonta * Math.sin(ang - 0.5));
          ctxEditor.moveTo(p.x, p.y); ctxEditor.lineTo(p.x - tPonta * Math.cos(ang + 0.5), p.y - tPonta * Math.sin(ang + 0.5)); ctxEditor.stroke();
      } else if (ferramentaAtual === 'z_rebar') {
          ctxEditor.strokeStyle = 'blue'; ctxEditor.fillStyle = 'blue';
          const tGancho = Math.max(20, canvasEditor.width * 0.04);
          ctxEditor.beginPath();
          ctxEditor.moveTo(startX + tGancho * Math.cos(ang - 1.5), startY + tGancho * Math.sin(ang - 1.5));
          ctxEditor.lineTo(startX, startY); ctxEditor.lineTo(p.x, p.y);
          ctxEditor.lineTo(p.x + tGancho * Math.cos(ang + 1.5), p.y + tGancho * Math.sin(ang + 1.5)); ctxEditor.stroke();
      } else if (ferramentaAtual === 'regua') {
          ctxEditor.strokeStyle = '#ffcc00'; ctxEditor.fillStyle = '#ffcc00';
          ctxEditor.beginPath(); ctxEditor.moveTo(startX, startY); ctxEditor.lineTo(p.x, p.y); ctxEditor.stroke();
          ctxEditor.beginPath(); ctxEditor.arc(startX, startY, 6, 0, 2*Math.PI); ctxEditor.fill();
          ctxEditor.beginPath(); ctxEditor.arc(p.x, p.y, 6, 0, 2*Math.PI); ctxEditor.fill();
      } else if (ferramentaAtual === 'circulo') {
          ctxEditor.strokeStyle = 'red';
          ctxEditor.beginPath(); ctxEditor.ellipse(startX, startY, Math.abs(p.x - startX), Math.abs(p.y - startY), 0, 0, 2 * Math.PI); ctxEditor.stroke();
      }
  }

  function finalizarDesenho(e) {
      if (!isDrawing) return;
      isDrawing = false;
      if (e.cancelable) e.preventDefault();
      if (ferramentaAtual === 'regua') {
          const txt = document.getElementById('textoEdicao').value.trim();
          if(txt){
              const p = getPos(e);
              ctxEditor.font = `bold ${Math.max(24, canvasEditor.width * 0.04)}px Tahoma, Arial`;
              ctxEditor.fillStyle = '#ffcc00'; ctxEditor.strokeStyle = 'black'; ctxEditor.lineWidth = 3;
              ctxEditor.strokeText(txt, (startX + p.x)/2, ((startY + p.y)/2) - 10); 
              ctxEditor.fillText(txt, (startX + p.x)/2, ((startY + p.y)/2) - 10);
          }
      }
      historicoEdicao.push(canvasEditor.toDataURL());
  }

  canvasEditor.addEventListener('mousedown', inciarDesenho, { passive: false });
  canvasEditor.addEventListener('mousemove', moverDesenho, { passive: false });
  canvasEditor.addEventListener('mouseup', finalizarDesenho, { passive: false });
  canvasEditor.addEventListener('touchstart', inciarDesenho, { passive: false });
  canvasEditor.addEventListener('touchmove', moverDesenho, { passive: false });
  canvasEditor.addEventListener('touchend', finalizarDesenho, { passive: false });

  document.getElementById('btnSalvarEdicao').onclick = () => {
      fotosSelecionadas[fotoAtualEdicaoIndex].edited = canvasEditor.toDataURL('image/jpeg', 0.85);
      renderizarInterface();
      document.getElementById('modalEditor').classList.add('modal-oculto');
      autoSalvar();
  };
  document.getElementById('btnDesfazerSeta').onclick = () => {
      if(historicoEdicao.length > 1) {
          historicoEdicao.pop(); 
          const img = new Image();
          img.onload = () => { ctxEditor.clearRect(0,0,canvasEditor.width,canvasEditor.height); ctxEditor.drawImage(img,0,0); };
          img.src = historicoEdicao[historicoEdicao.length - 1];
      }
  };
  document.getElementById('btnFecharModal').onclick = () => document.getElementById('modalEditor').classList.add('modal-oculto');

  // --- CROPPER ---
  window.abrirCrop = (idx) => {
      fotoAtualCropIndex = idx;
      const imgEl = document.getElementById('imgCrop');
      imgEl.src = fotosSelecionadas[idx].edited || fotosSelecionadas[idx].preview;
      document.getElementById('modalCrop').classList.remove('modal-oculto');
      if(cropperInstancia) cropperInstancia.destroy();
      imgEl.onload = () => { cropperInstancia = new Cropper(imgEl, { viewMode: 1, autoCropArea: 1, responsive: true }); };
  };
  document.getElementById('btnRotateL').onclick = () => { if(cropperInstancia) cropperInstancia.rotate(-90); };
  document.getElementById('btnRotateR').onclick = () => { if(cropperInstancia) cropperInstancia.rotate(90); };
  document.getElementById('btnCropLivre').onclick = () => { if(cropperInstancia) cropperInstancia.setAspectRatio(NaN); };
  document.getElementById('btnCrop43').onclick = () => { if(cropperInstancia) cropperInstancia.setAspectRatio(4/3); };
  
  document.getElementById('btnAplicarCrop').onclick = () => {
      if(cropperInstancia) {
          fotosSelecionadas[fotoAtualCropIndex].edited = cropperInstancia.getCroppedCanvas({ imageSmoothingQuality: 'high' }).toDataURL('image/jpeg', 0.85);
          renderizarInterface();
          document.getElementById('modalCrop').classList.add('modal-oculto');
          cropperInstancia.destroy(); cropperInstancia = null;
          autoSalvar();
      }
  };
  document.getElementById('btnFecharCrop').onclick = () => { 
      document.getElementById('modalCrop').classList.add('modal-oculto'); 
      if(cropperInstancia){ cropperInstancia.destroy(); cropperInstancia = null; } 
  };

  // --- ASSINATURAS ---
  document.getElementById('incluirAssinatura').addEventListener('change', function() {
    document.getElementById('btnAssinaturaLabel').style.display = this.checked ? 'inline-block' : 'none';
    if(!this.checked) assinaturaBase64 = null;
    autoSalvar();
  });
  document.getElementById('imagemAssinatura').addEventListener('change', function(e) {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        assinaturaBase64 = ev.target.result;
        document.getElementById('assinaturaStatus').style.display = 'inline-block';
        document.getElementById('btnRemoverAssinatura').style.display = 'inline-block';
        autoSalvar();
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });
  document.getElementById('btnRemoverAssinatura').addEventListener('click', function() {
    assinaturaBase64 = null;
    document.getElementById('assinaturaStatus').style.display = 'none';
    this.style.display = 'none';
    document.getElementById('imagemAssinatura').value = ''; 
    autoSalvar();
  });

  // --- GERAÇÃO DO PDF ---
  btnGerarPDF.addEventListener('click', () => {
    const local = document.getElementById('localVistoria').value || 'Não informado';
    let dataF = '___/___/_____';
    const valData = document.getElementById('dataVistoria').value;
    if(valData) {
        const partes = valData.split('-');
        dataF = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const hora = document.getElementById('horaVistoria').value || '--:--';
    const nomeFiscal = document.getElementById('nomeFiscal').value || 'Nome do Técnico';
    const cargoFiscal = document.getElementById('cargoFiscal').value || 'Cargo não informado';
    const taxaBdi = parseFloat(inputBDI.value) || 0;
    const justificativaBdi = document.getElementById('justificativaBdi').value || 'Padrão da Base de Custos';

    document.getElementById('cabecalho-relatorio').innerHTML = `
      <table style=\"width: 100%; border-collapse: collapse; margin-bottom: 2mm;\">
        <tr>
          <td style=\"width: 25mm;\"></td> 
          <td style=\"text-align: center; vertical-align: middle;\">
            <div style=\"font-family: Tahoma, Arial, sans-serif; font-size: 10pt; font-weight: bold; color: #12D0FF; text-transform: uppercase;\">COMPANHIA DE SANEAMENTO BÁSICO DO ESTADO DE SÃO PAULO</div>
            <div style=\"font-family: Tahoma, Arial, sans-serif; font-size: 15pt; font-weight: bold; color: #12D0FF; text-transform: uppercase; margin-top: 2px;\">ORÇAMENTO ESTIMATIVO DE RECUPERAÇÃO DE PATOLOGIAS</div>
          </td>
          <td style=\"width: 25mm; text-align: right; vertical-align: middle;\"><img src=\"sabesp-logo.png\" style=\"max-height: 18mm;\"></td>
        </tr>
      </table>
      <div style=\"border-top: 2px solid #12D0FF; margin-bottom: 4mm;\"></div>
      <table style=\"width: 100%; border-collapse: collapse; border: 1px solid #12D0FF; border-radius: 6px; margin-bottom: 6mm; font-family: Tahoma, Arial, sans-serif; font-size: 9.5pt; color: #000;\">
        <tr><td style=\"padding: 6px; border-bottom: 1px solid #eee;\"><strong>Local da Obra/Perícia:</strong> ${local}</td><td style=\"padding: 6px; border-bottom: 1px solid #eee; border-left: 1px solid #eee;\"><strong>Data:</strong> ${dataF} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Hora:</strong> ${hora}</td></tr>
        <tr><td style=\"padding: 6px;\"><strong>Responsável Técnico:</strong> ${nomeFiscal}</td><td style=\"padding: 6px; border-left: 1px solid #eee;\"><strong>Cargo:</strong> ${cargoFiscal}</td></tr>
      </table>
    `;

    const corpo = document.getElementById('corpo-relatorio'); corpo.innerHTML = '';
    let somaDireta = 0; let memorialTxt = "";
    let htmlResumoTotal = "";
    
    fotosSelecionadas.forEach((f, idx) => {
        const medTxt = f.tipo ? ` - ${f.medidaPrincipal} ${TIPOLOGIAS[f.tipo].unidadeBase}` : '';
        let sub = 0; let linhas = "";
        
        let memHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 9pt; font-family: Tahoma, Arial, sans-serif; border: 1px solid #aaa;">
            <tr style="background:#f9f9f9;"><th style="border: 1px solid #aaa; padding:2px; text-align:left;">Serviço Base (Código/Ref)</th><th style="border: 1px solid #aaa; padding:2px;">Cálculo Adotado</th><th style="border: 1px solid #aaa; padding:2px;">Subtotal</th></tr>`;

        const itensRender = [...(f.itensAutomaticos || []).filter(i => !i.removido), ...(f.itensManuais || [])];

        itensRender.forEach(it => { 
            let t = it.qtdAdotada * it.preco; sub += t; 
            
            linhas += `<tr>
                <td style="border:1px solid #aaa;"><span style="color:#12D0FF; font-weight:bold;">[${it.codigoEfetivo}]</span> ${it.desc}</td>
                <td style="text-align:center; border:1px solid #aaa;">${it.unid}</td>
                <td style="text-align:center; border:1px solid #aaa;">${it.qtdAdotada}</td>
                <td style="text-align:right; border:1px solid #aaa;">R$ ${it.preco.toFixed(2).replace('.',',')}</td>
                <td style="text-align:right; font-weight:bold; border:1px solid #aaa;">R$ ${t.toFixed(2).replace('.',',')}</td>
            </tr>`;
            
            memHtml += `<tr>
                <td style="border: 1px solid #aaa; padding:2px;">[${it.codigoEfetivo}] ${it.desc}</td>
                <td style="border: 1px solid #aaa; padding:2px; text-align:center; font-style:italic;">${it.formula} = ${it.qtdAdotada} ${it.unid}</td>
                <td style="border: 1px solid #aaa; padding:2px; text-align:right; font-weight:bold;">R$ ${t.toFixed(2).replace('.',',')}</td>
            </tr>`;
        });
        
        somaDireta += sub;
        memHtml += `</table>`;

        linhas += `<tr style="background:#f0f0f0;"><td colspan="4" align="right" style="font-weight:bold; border: 1px solid #aaa; padding:3px;">Subtotal Direto:</td><td style="font-weight:bold; text-align:right; border: 1px solid #aaa; padding:3px;">R$ ${sub.toFixed(2).replace('.',',')}</td></tr>`;

        htmlResumoTotal += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 4px 0;">Patologia 0${idx + 1} - ${f.tipo ? TIPOLOGIAS[f.tipo].nome : 'Não definida'}</td>
            <td style="padding: 4px 0; text-align: right;">R$ ${sub.toFixed(2).replace('.',',')}</td>
          </tr>
        `;

        const legendaLinha = f.legenda ? `<tr><td colspan="5" style="border: 1px solid #aaa; padding: 4px; background:#fefefe; font-style:italic; font-size:8pt;"><strong>Legenda / Obs:</strong> ${f.legenda}</td></tr>` : '';

        corpo.innerHTML += `<div class=\"bloco-patologia\"><h4 style="font-family: Tahoma, Arial, sans-serif; font-size: 10pt; border-bottom:1px solid #ccc; padding-bottom:1px; margin-bottom:5px;">Patologia 0${idx+1} - ${f.tipo ? TIPOLOGIAS[f.tipo].nome : ''}${medTxt}</h4>
          <img src=\"${f.edited || f.preview}\" class=\"imagem-patologia-print\">
          <table class=\"tabela-pdf\">
            <thead><tr><th>Serviço da Composição Orçamentária</th><th>Und</th><th>Qtd</th><th>V.Unit</th><th>Total</th></tr></thead>
            <tbody>
              ${legendaLinha}
              ${linhas}
            </tbody>
          </table>
        </div>`;
        
        if(f.tipo) {
            memorialTxt += `
            <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; page-break-inside: avoid;">
                <h5 style="font-family: Tahoma, Arial, sans-serif; font-size: 10pt; margin-bottom:1mm; margin-top:0;">Patologia 0${idx+1} - ${TIPOLOGIAS[f.tipo].nome}${medTxt}</h5>
                <p style="font-family: Tahoma, Arial, sans-serif; text-align:justify; font-size:9.5pt; margin-top:0; white-space: pre-wrap;">${TIPOLOGIAS[f.tipo].memorial}</p>
                ${memHtml}
            </div>`;
        } else {
            memorialTxt += `
            <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #ccc; page-break-inside: avoid;">
                <h5 style="font-family: Tahoma, Arial, sans-serif; font-size: 10pt; margin-bottom:1mm; margin-top:0;">Patologia 0${idx+1}</h5>
                <p style="font-family: Tahoma, Arial, sans-serif; text-align:justify; font-size:9.5pt; margin-top:0; color:#d9534f;">Nenhuma tipologia técnica ou composição definida para esta imagem.</p>
            </div>`;
        }
    });

    let bdiVal = somaDireta * (taxaBdi / 100);
    
    document.getElementById('bloco-total-geral').innerHTML = `
        <h4 style="font-family: Tahoma, Arial, sans-serif; font-size: 11pt; border-bottom: 1px solid #ccc; padding-bottom:2px; margin-top: 5px;">Resumo Financeiro Global</h4>
        <table style="width: 100%; border-collapse: collapse; font-family: Tahoma, Arial, sans-serif; font-size: 10pt;">
            ${htmlResumoTotal}
            <tr style="border-top: 1px solid #ccc; background:#f9f9f9;"><td style="padding:4px;"><strong>Soma dos Custos Diretos:</strong></td><td style="text-align:right; font-weight:bold;">R$ ${somaDireta.toFixed(2).replace('.',',')}</td></tr>
            <tr style="border-bottom: 1px solid #ccc;">
                <td style="padding:4px; color:#12D0FF;">
                    <strong>BDI Aplicado (${taxaBdi}%):</strong><br>
                    <span style="font-size:8pt; font-weight:normal; color:#555;">Critério de Adoção: ${justificativaBdi}</span>
                </td>
                <td style="text-align:right; vertical-align:top; font-weight:bold; color:#12D0FF;">+ R$ ${bdiVal.toFixed(2).replace('.',',')}</td>
            </tr>
            <tr><td style="padding:4px; font-size:12pt; font-weight:bold;">TOTAL ESTIMADO:</td><td style="text-align:right; font-size:12pt; font-weight:bold; color:#d9534f;">R$ ${(somaDireta+bdiVal).toFixed(2).replace('.',',')}</td></tr>
        </table>`;
    
    document.getElementById('texto-memorial-impresso').innerHTML = memorialTxt;
    
    if (document.getElementById('incluirAssinatura').checked) {
        const nomeFiscal = document.getElementById('nomeFiscal').value || 'Nome do Técnico';
        const cargoFiscal = document.getElementById('cargoFiscal').value || 'Cargo não informado';
        let imgAssin = assinaturaBase64 ? `<img src="${assinaturaBase64}" class="assinatura-imagem-limpa">` : `<div style="height: 15mm; width: 100%; z-index:-1; position:relative;"></div>`; 
        
        document.getElementById('texto-memorial-impresso').innerHTML += `
           <div class="assinaturas-container" style="page-break-inside: avoid;">
              <div class="bloco-assinatura">
                  ${imgAssin}
                  <div class="linha-assinatura"></div>
                  <strong>${nomeFiscal}</strong>
                  <span>${cargoFiscal}</span>
              </div>
           </div>`;
    }

    const rel = document.getElementById('area-relatorio'); 
    rel.style.display = 'block';
    
    window.onafterprint = () => { rel.style.display = 'none'; };
    setTimeout(() => { window.print(); setTimeout(() => { rel.style.display = 'none'; }, 2000); }, 300);
  });
});
