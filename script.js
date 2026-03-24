document.addEventListener('DOMContentLoaded', () => {
  const inputSelecionarFotos = document.getElementById('selecionarFotos');
  const galeriaPreview = document.getElementById('galeria-fotos-legenda');
  const btnGerarPDF = document.getElementById('btnGerarPDF');
  const canvasEditor = document.getElementById('canvasEditor');
  const ctxEditor = canvasEditor.getContext('2d');
  const modalEditor = document.getElementById('modalEditor');
  const modalCrop = document.getElementById('modalCrop');
  const inputBDI = document.getElementById('bdiGeral');
  
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

  // Carregamento de base de dados
  fetch('SINAPI_ATUALIZADO.json').then(r => r.json()).then(d => baseSinapi = d).catch(() => {
      fetch('SINPLAN_ATUALIZADO.json').then(r => r.json()).then(d => baseSinapi = d).catch(e => console.warn("Base offline."));
  });

  function parsePreco(valorStr) {
      if (!valorStr) return 0;
      let cln = valorStr.toString().replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
      return parseFloat(cln) || 0;
  }

  function normalizarTexto(texto) {
      return texto ? texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : "";
  }

  const ACABAMENTOS = {
      'none': { desc: 'Sem acabamento adicional', preco: 0, busca: '' },
      'pintura_latex': { desc: 'Emassamento e Pintura Látex', unid: 'm²', preco: 38.00, busca: 'pintura latex' },
      'pintura_acrilica': { desc: 'Emassamento e Pintura Acrílica', unid: 'm²', preco: 48.00, busca: 'pintura acrilica' },
      'textura': { desc: 'Aplicação de Selador e Textura Acrílica', unid: 'm²', preco: 58.00, busca: 'textura acrilica' },
      'ceramica': { desc: 'Assentamento de Revestimento Cerâmico', unid: 'm²', preco: 92.00, busca: 'revestimento ceramico' }
  };

  const TIPOLOGIAS = {
      TRINCA_PASSIVA_LEVE: {
          nome: "Trinca/Fissura Passiva (Superficial/Leve)",
          memorial: "1. Abertura de sulco superficial ao longo da diretriz da fissura (escarificação leve do revestimento).\n2. Limpeza enérgica com escova e ar comprimido para remoção de partículas soltas.\n3. Preenchimento do vão com argamassa polimérica ou resina epóxi de baixa viscosidade, visando a recomposição e estabilização superficial.\n4. Regularização da superfície para posterior recebimento de acabamento.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Abertura de trinca/fissura superficial", unid: "m", precoUnit: 14.50, busca: "abertura trinca", mult: 1 },
              { desc: "Preenchimento com argamassa polimérica / resina", unid: "m", precoUnit: 35.00, busca: "argamassa polimerica", mult: 1 }
          ]
      },
      TRINCA_PASSIVA_ESTRUTURAL: {
          nome: "Trinca Passiva (Estrutural/Profunda)",
          memorial: "1. Abertura de sulco ao longo da diretriz da fissura e escarificação mecânica profunda do substrato.\n2. Limpeza enérgica com escova de aço e jato de ar comprimido.\n3. Preenchimento estrutural do vão com resina epóxi de baixa viscosidade (consumo estim. 0,30 kg/m), visando o restabelecimento do monolitismo da peça estrutural.\n4. Inserção transversal de armadura em 'Z' (costura com grampos de aço) a cada 30cm.\n5. Ancoragem com adesivo estrutural de base epóxi para travamento mecânico das bordas.\n6. Chapisco e emboço localizado.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Abertura de trinca/fissura estrutural profunda", unid: "m", precoUnit: 24.00, busca: "abertura trinca", mult: 1 },
              { desc: "Injeção/Preenchimento com resina epóxi estrutural", unid: "m", precoUnit: 85.00, busca: "resina epoxi", mult: 1 },
              { desc: "Aço CA-50 para grampos de costura (1 a cada 30cm)", unid: "un", precoUnit: 8.50, busca: "aço ca-50", mult: "CEIL_GRAMPO" },
              { desc: "Adesivo estrutural epóxi (0.08kg por grampo)", unid: "kg", precoUnit: 115.00, busca: "adesivo estrutural epoxi", mult: "GRAMPO_X_008" },
              { desc: "Chapisco e emboço localizado para regularização", unid: "m²", precoUnit: 52.00, busca: "reboco argamassa", mult: 0.5 }
          ]
      },
      TRINCA_ATIVA: {
          nome: "Trinca/Fissura Ativa (Movimentação Dinâmica)",
          memorial: "1. Abertura de sulco em 'V' com dimensões proporcionais à movimentação esperada.\n2. Limpeza e secagem rigorosa da base.\n3. Inserção de limitador de profundidade (tarugo de polietileno expandido) para evitar aderência no fundo da junta.\n4. Aplicação de primer e preenchimento integral com selante elastomérico flexível (PU).\n5. Colocação de tela de poliéster engastada na camada de acabamento (bandagem).\n6. Emassamento com massa acrílica flexível para dissipação de tensões longitudinais.",
          unidadeBase: "m", fatorArea: 0.5,
          composicao: [
              { desc: "Abertura de junta/sulco em 'V' e limpeza", unid: "m", precoUnit: 22.00, busca: "abertura junta", mult: 1 },
              { desc: "Aplicação de fundo de junta (tarugo de polietileno)", unid: "m", precoUnit: 5.50, busca: "fundo de junta", mult: 1 },
              { desc: "Selamento com mastique elastomérico (PU) e primer", unid: "m", precoUnit: 62.00, busca: "selante poliuretano", mult: 1 },
              { desc: "Emassamento com massa acrílica elastomérica", unid: "m²", precoUnit: 42.00, busca: "massa acrilica", mult: 0.5 }
          ]
      },
      UMIDADE_AGUA: {
          nome: "Manchas de Umidade (Vazamento de Água)",
          memorial: "1. Demolição do reboco e revestimento comprometido até a alvenaria nua, com margem de segurança de 30 a 50cm além da mancha visível.\n2. Limpeza da base.\n3. Aplicação de chapisco de aderência.\n4. Refazimento do emboço utilizando argamassa aditivada com impermeabilizante hidrófugo por cristalização.",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Demolição de reboco e limpeza de substrato", unid: "m²", precoUnit: 22.50, busca: "demolição reboco", mult: 1 },
              { desc: "Chapisco de aderência (SINAPI/TCPO)", unid: "m²", precoUnit: 12.00, busca: "chapisco", mult: 1 },
              { desc: "Reboco impermeável com aditivo hidrófugo", unid: "m²", precoUnit: 58.00, busca: "reboco impermeabilizante", mult: 1 }
          ]
      },
      UMIDADE_ESGOTO: {
          nome: "Contaminação e Umidade (Vazamento de Esgoto)",
          memorial: "1. Demolição profunda do revestimento contaminado (margem >50cm).\n2. Lavagem sanitizante com solução de hipoclorito de sódio a 5%, seguida de aplicação de biocida/fungicida para inibição de bolores.\n3. Chapisco de aderência.\n4. Novo reboco estrutural formulado com cimento resistente a sulfatos (RS).",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Demolição profunda de revestimento contaminado", unid: "m²", precoUnit: 30.00, busca: "demolição revestimento", mult: 1 },
              { desc: "Lavagem sanitizante com hipoclorito de sódio a 5%", unid: "m²", precoUnit: 45.00, busca: "hipoclorito", mult: 1 },
              { desc: "Chapisco com cimento resistente a sulfatos (RS)", unid: "m²", precoUnit: 18.00, busca: "chapisco", mult: 1 },
              { desc: "Reboco estrutural com cimento RS", unid: "m²", precoUnit: 82.00, busca: "reboco cimento", mult: 1 }
          ]
      },
      CORROSAO_ARMADURA: {
          nome: "Corrosão de Armaduras / Desplacamento de Concreto",
          memorial: "1. Apicoamento/escarificação do concreto degradado até 2cm na retaguarda da armadura.\n2. Limpeza mecânica abrasiva do aço exposto até alcançar o grau ST3 (metal branco).\n3. Aplicação de primer anticorrosivo rico em zinco em 360º da barra afetada.\n4. Aplicação de ponte de aderência epóxi no substrato de concreto antigo.\n5. Recomposição rigorosa da seção geométrica com graute ou argamassa polimérica tixotrópica estrutural.",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Apicoamento/escarificação mecânica do concreto", unid: "m²", precoUnit: 110.00, busca: "apicoamento", mult: 1 },
              { desc: "Primer anticorrosivo base zinco 360º na armadura", unid: "m²", precoUnit: 145.00, busca: "primer zinco", mult: 1 },
              { desc: "Ponte de aderência estrutural à base de epóxi", unid: "m²", precoUnit: 85.00, busca: "ponte aderencia", mult: 1 },
              { desc: "Recomposição com graute tixotrópico estrutural", unid: "m²", precoUnit: 190.00, busca: "graute tixotropico", mult: 1 }
          ]
      },
      REPOSICAO_PAVIMENTO: {
          nome: "Reposição de Pavimento e Passeio",
          memorial: "1. Recorte mecanizado e demolição da área afetada.\n2. Recomposição e compactação da base com BGS.\n3. Aplicação do revestimento superficial (CBUQ, Concreto ou Cerâmica) conforme o padrão original existente no local.",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Recorte e demolição manual de passeio e pavimento", unid: "m²", precoUnit: 23.30, busca: "demolição", mult: 1 },
              { desc: "Recomposição com base de BGS", unid: "m²", precoUnit: 25.10, busca: "brita graduada", mult: 1 },
              { desc: "Recomposição com Concreto Asfáltico (CBUQ)", unid: "m²", precoUnit: 89.50, busca: "concreto asfaltico", mult: 1 },
              { desc: "Recomposição em Concreto Simples 15 MPa", unid: "m²", precoUnit: 75.30, busca: "concreto", mult: 1 },
              { desc: "Recomposição de piso cerâmico c/ contrapiso", unid: "m²", precoUnit: 95.80, busca: "piso ceramico", mult: 1 }
          ]
      },
      RECALQUE_ESTACA_MEGA: {
          nome: "Recalque de Fundação (Reforço com Estaca Mega)",
          memorial: "1. Mobilização de equipamentos e monitoramento da estrutura.\n2. Escavação manual e escoramento para abertura de poço.\n3. Cravação de estacas mega de concreto por macacagem.\n4. Encunhamento e concretagem do bloco de transição.\n5. Recomposição arquitetônica e remoção de entulho.",
          unidadeBase: "un", fatorArea: 1.0, 
          composicao: [
              // Bloqueado a busca da palavra estrita mobilização para não puxar Franki
              { desc: "Mobilização de equipamento leve (Macaco Hidráulico)", unid: "un", precoUnit: 350.00, busca: "mobilizacao macaco hidraulico", mult: 1 },
              { desc: "Escavação manual e escoramento de poço", unid: "un", precoUnit: 450.00, busca: "escavação manual", mult: 1 },
              { desc: "Cravação de Estaca Mega de concreto (estimado 10m)", unid: "m", precoUnit: 320.00, busca: "estaca mega", mult: 10 },
              { desc: "Encunhamento e grauteamento do bloco", unid: "un", precoUnit: 950.00, busca: "encunhamento", mult: 1 },
              { desc: "Recomposição de contrapiso e piso cerâmico", unid: "m²", precoUnit: 150.00, busca: "contrapiso", mult: 2 },
              { desc: "Remoção de entulho / Caçamba (rateio)", unid: "un", precoUnit: 450.00, busca: "caçamba", mult: 0.5 }
          ]
      },
      RECALQUE_EROSAO_PIPING: {
          nome: "Recalque por Erosão / Fuga de Material (Piping)",
          memorial: "1. Perfuração do contrapiso ou fundação para acesso aos vazios.\n2. Injeção sob pressão de calda de cimento ou concreto fluido para preenchimento da erosão e estabilização do solo carreável.",
          unidadeBase: "m³", fatorArea: 1.0,
          composicao: [
              { desc: "Furação mecanizada de laje/contrapiso p/ acesso", unid: "un", precoUnit: 35.00, busca: "furo", mult: 2 },
              { desc: "Injeção de calda de cimento/concreto fluido", unid: "m³", precoUnit: 680.00, busca: "calda de cimento", mult: 1 }
          ]
      },
      ATAQUE_SULFATOS: {
          nome: "Ataque Químico por Sulfatos (Concreto)",
          memorial: "1. Demolição e apicoamento do concreto estrutural contaminado.\n2. Lavagem química e neutralização da base.\n3. Recomposição estrutural utilizando argamassa ou graute formulado com cimento Resistente a Sulfatos (RS).",
          unidadeBase: "m²", fatorArea: 1.0,
          composicao: [
              { desc: "Apicoamento/escarificação do concreto", unid: "m²", precoUnit: 110.00, busca: "apicoamento", mult: 1 },
              { desc: "Lavagem química preparatória", unid: "m²", precoUnit: 45.00, busca: "lavagem", mult: 1 },
              { desc: "Recomposição com Graute Estrutural (Cimento RS)", unid: "m²", precoUnit: 220.00, busca: "graute", mult: 1 }
          ]
      }
  };

  // =========================================================================
  // SALVAMENTO OTIMIZADO COM DEBOUNCE (FIM DA LENTIDÃO/TRAVAMENTOS)
  // =========================================================================
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
                  assinatura: assinaturaBase64,
                  fotos: fotosSelecionadas
              };
              localStorage.setItem('projetoPatologiasSabesp', JSON.stringify(projeto));
              
              status.style.color = 'green';
              status.innerText = 'Projeto salvo automaticamente ✔';
              setTimeout(() => status.innerText = '', 3000);
          } catch(e) { 
              console.error("Erro ao salvar", e); 
              status.style.color = 'red';
              status.innerText = 'Erro ao salvar (limite de memória)';
          }
      }, 1500); // Aguarda 1.5 segundos após a última digitação
  }

  function carregarDoLocalStorage() {
      const salvo = localStorage.getItem('projetoPatologiasSabesp');
      if (salvo) {
          try {
              const p = JSON.parse(salvo);
              document.getElementById('localVistoria').value = p.local || '';
              document.getElementById('dataVistoria').value = p.data || '';
              document.getElementById('horaVistoria').value = p.hora || '';
              document.getElementById('nomeFiscal').value = p.fiscal || '';
              document.getElementById('cargoFiscal').value = p.cargo || 'Engenheiro Civil';
              document.getElementById('bdiGeral').value = p.bdi || '10.0';
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
          assinatura: assinaturaBase64, fotos: fotosSelecionadas
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
              document.getElementById('bdiGeral').value = p.bdi || '10.0';
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
      if(confirm("Tem certeza? Isso apagará todas as fotos e dados não salvos. Use isso para iniciar um projeto do zero ou para atualizar os preços.")) {
          fotosSelecionadas = []; assinaturaBase64 = null;
          document.getElementById('form-vistoria').reset();
          document.getElementById('bdiGeral').value = "10.0";
          document.getElementById('assinaturaStatus').style.display = 'none';
          document.getElementById('btnRemoverAssinatura').style.display = 'none';
          renderizarInterface();
          localStorage.removeItem('projetoPatologiasSabesp');
      }
  };

  // =========================================================================
  // GESTÃO DE IMAGENS E INTERFACE
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
                    tipo: '', acabamento: 'none', medidaPrincipal: 1, itensOrcamento: [], legenda: ''
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

  function reconstruirComposicao(foto) {
      if (!foto.tipo || !TIPOLOGIAS[foto.tipo]) return;
      const m = foto.medidaPrincipal;
      foto.itensOrcamento = [];
      
      TIPOLOGIAS[foto.tipo].composicao.forEach(c => {
          let qtdFinal = m;
          if (c.mult === "CEIL_GRAMPO") qtdFinal = Math.ceil(m / 0.3);
          else if (c.mult === "GRAMPO_X_008") qtdFinal = Math.ceil(m / 0.3) * 0.08;
          else if (typeof c.mult === 'number') qtdFinal = m * c.mult;

          let preco = c.precoUnit;
          let desc = c.desc;
          if (baseSinapi.length > 0) {
              const termoNorm = normalizarTexto(c.busca);
              let s = baseSinapi.find(i => normalizarTexto(i["TABELA DE CUSTOS SINTÉTICA"]).includes(termoNorm));
              if (s) { preco = parsePreco(s["FIELD4"]); desc = s["TABELA DE CUSTOS SINTÉTICA"]; }
          }
          foto.itensOrcamento.push({ desc, unid: c.unid, qtd: parseFloat(qtdFinal.toFixed(2)), preco, multRef: c.mult });
      });

      if (foto.acabamento !== 'none') {
          const a = ACABAMENTOS[foto.acabamento];
          let area = m * TIPOLOGIAS[foto.tipo].fatorArea;
          let preco = a.preco;
          let desc = a.desc;
          
          if (baseSinapi.length > 0) {
              const termoNorm = normalizarTexto(a.busca);
              let s = baseSinapi.find(i => normalizarTexto(i["TABELA DE CUSTOS SINTÉTICA"]).includes(termoNorm));
              if (s) { preco = parsePreco(s["FIELD4"]); desc = s["TABELA DE CUSTOS SINTÉTICA"]; }
          }
          foto.itensOrcamento.push({ desc, unid: a.unid, qtd: parseFloat(area.toFixed(2)), preco, multRef: TIPOLOGIAS[foto.tipo].fatorArea });
      }
  }

  function atualizarTotaisNoDOM() {
      let totalDiretoGlobal = 0;
      let resumoHtml = `<h4 style="margin: 0 0 10px 0; color: #555;">Subtotais Diretos:</h4><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.9em; color: #333;">`;

      fotosSelecionadas.forEach((foto, idx) => {
          let subtotalPatologia = 0;
          foto.itensOrcamento.forEach((item, itemIdx) => {
              let totalItem = item.qtd * item.preco;
              subtotalPatologia += totalItem;

              const celulaTotalItem = document.getElementById(`totalItem-${idx}-${itemIdx}`);
              if (celulaTotalItem) celulaTotalItem.innerText = `R$ ${totalItem.toFixed(2).replace('.',',')}`;
              
              const inputQtd = document.getElementById(`qtd-${idx}-${itemIdx}`);
              if (inputQtd && document.activeElement !== inputQtd) inputQtd.value = item.qtd;
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
        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 1em; color: #000;">
            <span>Soma dos Custos Diretos:</span>
            <strong>R$ ${totalDiretoGlobal.toFixed(2).replace('.',',')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 1em; color: #12D0FF;">
            <span>BDI (${taxaBdi}%):</span>
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
              const a = ACABAMENTOS[f.acabamento];
              f.itensOrcamento = f.itensOrcamento.filter(it => !it.desc.includes(a.desc));
              f.itensOrcamento.push({ desc: a.desc + " (Pano Inteiro)", unid: a.unid, qtd: area, preco: a.preco, multRef: null });
              renderizarInterface();
              autoSalvar();
          }
      }
  };

  function renderizarInterface() {
    galeriaPreview.innerHTML = '';

    fotosSelecionadas.forEach((foto, idx) => {
      const card = document.createElement('div');
      card.className = 'card-patologia';
      const tituloMedidaT = foto.tipo ? ` - ${foto.medidaPrincipal} ${TIPOLOGIAS[foto.tipo].unidadeBase}` : '';

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
                    <div style="flex:2; min-width: 200px;">
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
                    <thead><tr><th>Serviço</th><th>Und</th><th>Qtd</th><th>Unit</th><th>Total</th><th>✖</th></tr></thead>
                    <tbody>
                        ${foto.itensOrcamento.map((it, iIdx) => `
                            <tr>
                                <td style="font-size:0.9em;">${it.desc}</td><td style="text-align:center;">${it.unid}</td>
                                <td><input type="number" id="qtd-${idx}-${iIdx}" step="0.01" value="${it.qtd}" oninput="atualizarQtdItem(${idx}, ${iIdx}, this.value)"></td>
                                <td style="text-align:right;">R$ ${it.preco.toFixed(2).replace('.',',')}</td>
                                <td id="totalItem-${idx}-${iIdx}" style="text-align:right; font-weight:bold;">R$ ${(it.qtd * it.preco).toFixed(2).replace('.',',')}</td>
                                <td style="text-align:center;"><button onclick="removerItem(${idx}, ${iIdx})" style="color:red; border:none; background:none; cursor:pointer;">✖</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot><tr style="background:#f8f9fa;"><td colspan="4" style="text-align:right; font-weight:bold;">Subtotal Direto:</td><td id="subtotal-${idx}" style="font-weight:bold; color:#12D0FF; text-align:right;">R$ 0,00</td><td></td></tr></tfoot>
                </table>
            </div>
            <div style="border: 1px dashed #bbb; padding: 10px; margin-top: 5px; background: #fafafa; border-radius: 4px;">
                <span style="font-weight:bold; font-size: 0.9em; color:#555;">➕ Incluir Serviço Adicional ou Preliminar:</span>
                <div style="margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap;">
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Caçamba de Entulho (5m³)', 'un', 450.00)">+ Caçamba</button>
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Andaime Fachadeiro/Tubular (m²xMês)', 'm²', 25.00)">+ Andaime</button>
                    <button type="button" class="botao-secundario" style="font-size: 0.75em; padding: 4px 6px;" onclick="adicionarItemRapido(${idx}, 'Emissão de ART / Laudo Técnico', 'un', 350.00)">+ ART</button>
                </div>
                <div class="busca-sinapi-local" style="margin-top: 8px;">
                    <input type="text" id="busca-${idx}" placeholder="Buscar no SINAPI..." onkeyup="pesquisarSinapi(event, ${idx})">
                    <select id="resultado-${idx}"><option value="">Aguardando busca...</option></select>
                    <button onclick="adicionarSinapiNaPatologia(${idx})" style="background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">Inserir</button>
                </div>
            </div>
            <textarea placeholder="Observações e legenda para o laudo..." oninput="atualizarLegenda(${idx}, this.value)" style="min-height: 60px;">${foto.legenda}</textarea>
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
  window.atualizarQtdItem = (idx, iIdx, val) => { fotosSelecionadas[idx].itensOrcamento[iIdx].qtd = parseFloat(val) || 0; atualizarTotaisNoDOM(); autoSalvar(); };
  window.removerItem = (idx, iIdx) => { fotosSelecionadas[idx].itensOrcamento.splice(iIdx, 1); renderizarInterface(); autoSalvar(); };
  window.atualizarLegenda = (idx, texto) => { fotosSelecionadas[idx].legenda = texto; autoSalvar(); };

  window.adicionarItemRapido = function(idxFoto, desc, unid, precoBase) {
      fotosSelecionadas[idxFoto].itensOrcamento.push({ desc: desc, unid: unid, qtd: 1, preco: precoBase, multRef: null });
      renderizarInterface();
      autoSalvar();
  };

  window.pesquisarSinapi = function(event, idxFoto) {
      const termo = normalizarTexto(event.target.value);
      const select = document.getElementById(`resultado-${idxFoto}`);
      select.innerHTML = '';
      if(termo.length < 3) { select.innerHTML = '<option value="">Digite 3 letras...</option>'; return; }
      
      const resultados = baseSinapi.filter(i => i["TABELA DE CUSTOS SINTÉTICA"] && normalizarTexto(i["TABELA DE CUSTOS SINTÉTICA"]).includes(termo)).slice(0, 40);
      if(resultados.length === 0) { select.innerHTML = '<option value="">Nada encontrado.</option>'; return; }

      resultados.forEach(item => {
          const desc = item["TABELA DE CUSTOS SINTÉTICA"];
          const preco = parsePreco(item["FIELD4"]);
          const unid = item["FIELD3"] || "un";
          const opt = document.createElement('option');
          opt.value = JSON.stringify({ desc, unid, preco });
          opt.text = `${desc.substring(0,50)}... | ${unid} | R$ ${preco.toFixed(2)}`;
          select.appendChild(opt);
      });
  };

  window.adicionarSinapiNaPatologia = function(idxFoto) {
      const select = document.getElementById(`resultado-${idxFoto}`);
      if (!select.value || select.value.startsWith('Aguardando') || select.value.startsWith('Nenhum') || select.value.startsWith('Digite')) return;
      const dadosItem = JSON.parse(select.value);
      fotosSelecionadas[idxFoto].itensOrcamento.push({ desc: dadosItem.desc, unid: dadosItem.unid, qtd: 1, preco: dadosItem.preco, multRef: null });
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
      
      <table style=\"width: 100%; border-collapse: collapse; border: 1px solid #12D0FF; border-radius: 6px; margin-bottom: 6mm; font-family: Tahoma, Arial, sans-serif; font-size: 10pt; color: #000;\">
        <tr>
          <td style=\"padding: 8px; border-bottom: 1px solid #eee;\"><strong>Local da Obra/Perícia:</strong> ${local}</td>
          <td style=\"padding: 8px; border-bottom: 1px solid #eee; border-left: 1px solid #eee;\"><strong>Data:</strong> ${dataF} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Hora:</strong> ${hora}</td>
        </tr>
        <tr>
          <td style=\"padding: 8px;\"><strong>Responsável Técnico:</strong> ${nomeFiscal}</td>
          <td style=\"padding: 8px; border-left: 1px solid #eee;\"><strong>Cargo:</strong> ${cargoFiscal}</td>
        </tr>
      </table>
    `;

    const corpo = document.getElementById('corpo-relatorio'); corpo.innerHTML = '';
    let somaDireta = 0; let memorialTxt = "";
    let htmlResumoTotal = "";
    
    fotosSelecionadas.forEach((f, idx) => {
        const medTxt = f.tipo ? ` - ${f.medidaPrincipal} ${TIPOLOGIAS[f.tipo].unidadeBase}` : '';
        let sub = 0; let linhas = "";
        
        let memHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10pt; font-family: Tahoma, Arial, sans-serif; border: 1px solid #ccc;">
            <tr style="background:#f9f9f9;"><th style="border: 1px solid #ccc; padding:4px; text-align:left;">Serviço</th><th style="border: 1px solid #ccc; padding:4px;">Memória de Cálculo</th><th style="border: 1px solid #ccc; padding:4px;">Subtotal</th></tr>`;

        f.itensOrcamento.forEach(it => { 
            let t = it.qtd * it.preco; sub += t; 
            linhas += `<tr><td style="border:1px solid #ccc; padding:4px;">${it.desc}</td><td style="text-align:center; border:1px solid #ccc; padding:4px;">${it.unid}</td><td style="text-align:center; border:1px solid #ccc; padding:4px;">${it.qtd}</td><td style="text-align:right; border:1px solid #ccc; padding:4px;">R$ ${it.preco.toFixed(2).replace('.',',')}</td><td style="text-align:right; font-weight:bold; border:1px solid #ccc; padding:4px;">R$ ${t.toFixed(2).replace('.',',')}</td></tr>`;
            
            let formTxt = "Inserção manual";
            if (it.multRef === "CEIL_GRAMPO") formTxt = `Arred.Teto(${f.medidaPrincipal} / 0.3)`;
            else if (it.multRef === "GRAMPO_X_008") formTxt = `Grampos x 0.08 kg`;
            else if (it.multRef !== null && it.multRef !== undefined) formTxt = `${f.medidaPrincipal} x ${it.multRef} (Fator)`;

            memHtml += `<tr><td style="border: 1px solid #ccc; padding:4px;">${it.desc}</td><td style="border: 1px solid #ccc; padding:4px; text-align:center; font-style:italic;">${formTxt} = ${it.qtd} ${it.unid}</td><td style="border: 1px solid #ccc; padding:4px; text-align:right; font-weight:bold;">R$ ${t.toFixed(2).replace('.',',')}</td></tr>`;
        });
        somaDireta += sub;
        memHtml += `</table>`;

        htmlResumoTotal += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 4px 0;">Patologia 0${idx + 1} - ${f.tipo ? TIPOLOGIAS[f.tipo].nome : 'Não definida'}</td>
            <td style="padding: 4px 0; text-align: right;">R$ ${sub.toFixed(2).replace('.',',')}</td>
          </tr>
        `;

        const legendaLinha = f.legenda ? `<tr><td colspan="5" style="border: 1px solid #ccc; padding: 6px; background:#fefefe; font-style:italic; font-size:9pt;"><strong>Legenda / Obs:</strong> ${f.legenda}</td></tr>` : '';

        corpo.innerHTML += `<div class=\"bloco-patologia\"><h4 style="font-family: Tahoma, Arial, sans-serif; font-size: 11pt; border-bottom:1px solid #ccc; padding-bottom:2px; margin-bottom:10px;">Patologia 0${idx+1} - ${f.tipo ? TIPOLOGIAS[f.tipo].nome : ''}${medTxt}</h4>
          <img src=\"${f.edited || f.preview}\" class=\"imagem-patologia-print\">
          <table class=\"tabela-pdf\" style="margin-top: 5mm;">
            <thead><tr><th>Serviço da Composição Orçamentária</th><th>Und</th><th>Qtd</th><th>V.Unit</th><th>Total</th></tr></thead>
            <tbody>
              ${legendaLinha}
              ${linhas}
            </tbody>
            <tfoot><tr style="background:#f0f0f0;"><td colspan=\"4\" align=\"right\" style="font-weight:bold; border: 1px solid #ccc;">Subtotal Direto:</td><td style="font-weight:bold; text-align:right; border: 1px solid #ccc;">R$ ${sub.toFixed(2).replace('.',',')}</td></tr></tfoot>
          </table>
        </div>`;
        
        if(f.tipo) memorialTxt += `<h5 style="font-family: Tahoma, Arial, sans-serif; font-size: 11pt; margin-bottom:2mm;">Patologia 0${idx+1}${medTxt}</h5><p style="font-family: Tahoma, Arial, sans-serif; text-align:justify;">${TIPOLOGIAS[f.tipo].memorial}</p>${memHtml}<br><br>`;
    });

    let bdiVal = somaDireta * (taxaBdi / 100);
    document.getElementById('bloco-total-geral').innerHTML = `
        <h4 style="font-family: Tahoma, Arial, sans-serif; font-size: 12pt; border-bottom: 1px solid #ccc; padding-bottom:2px; margin-top: 10px;">Resumo Financeiro Global</h4>
        <table style="width: 100%; border-collapse: collapse; font-family: Tahoma, Arial, sans-serif; font-size: 11pt;">
            ${htmlResumoTotal}
            <tr style="border-top: 1px solid #ccc; background:#f9f9f9;"><td style="padding:5px;"><strong>Soma dos Custos Diretos:</strong></td><td style="text-align:right; font-weight:bold;">R$ ${somaDireta.toFixed(2).replace('.',',')}</td></tr>
            <tr style="border-bottom: 1px solid #ccc;"><td style="padding:5px; color:#12D0FF;"><strong>BDI Aplicado (${taxaBdi}%):</strong></td><td style="text-align:right; font-weight:bold; color:#12D0FF;">+ R$ ${bdiVal.toFixed(2).replace('.',',')}</td></tr>
            <tr><td style="padding:5px; font-size:13pt; font-weight:bold;">TOTAL ESTIMADO:</td><td style="text-align:right; font-size:13pt; font-weight:bold; color:#d9534f;">R$ ${(somaDireta+bdiVal).toFixed(2).replace('.',',')}</td></tr>
        </table>`;
    
    document.getElementById('texto-memorial-impresso').innerHTML = memorialTxt;
    
    if (document.getElementById('incluirAssinatura').checked) {
        let imgAssin = assinaturaBase64 ? `<img src="${assinaturaBase64}" class="assinatura-imagem-limpa">` : `<div style="height: 15mm; width: 100%; z-index:-1; position:relative;"></div>`; 
        
        document.getElementById('texto-memorial-impresso').innerHTML += `
           <div class="assinaturas-container">
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
