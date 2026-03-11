const Fastify = require('fastify');
const cors = require('@fastify/cors');

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: '*' });

function arredondarAreia(volume) {
  if (volume <= 0) return 0;
  if (volume <= 0.125) return 0.125;
  if (volume <= 0.25) return 0.25;
  if (volume <= 0.5) return 0.5;
  return Math.ceil(volume * 2) / 2;
}

// ==========================================
// ROTA 1: CALCULADORA DE ALVENARIA 
// ==========================================
fastify.post('/api/calcular-alvenaria', async (request, reply) => {
  const { comprimento, altura, aberturas, tijolo, traco, ladosReboco, espessuraReboco } = request.body;
  const areaBruta = comprimento * altura;
  let areaDescontos = 0;
  if (aberturas && aberturas.length > 0) {
    for (let i = 0; i < aberturas.length; i++) {
      areaDescontos += (aberturas[i].largura * aberturas[i].altura);
    }
  }
  const areaFinal = areaBruta - areaDescontos;
  if (areaFinal <= 0) return reply.status(400).send({ erro: 'Área de descontos maior que a área total.' });

  let tijolosPorMetro = tijolo === 'baiano-6' ? 33 : tijolo === 'baiano-8' ? 25 : 12.5;
  let quantidadeTijolos = areaFinal * tijolosPorMetro * 1.10;

  let materiaisMassa = { tipo: traco, sacosCimento: 0, areiaM3: 0, sacosArgamassaPronta: 0 };
  if (traco === 'pronta') {
    materiaisMassa.sacosArgamassaPronta = Math.ceil((areaFinal * 17) / 20);
  } else {
    materiaisMassa.areiaM3 = arredondarAreia(areaFinal * 0.02);
    let kgCimento = traco === 'padrao' ? areaFinal * 5 : traco === 'forte' ? areaFinal * 7 : areaFinal * 4.5;
    materiaisMassa.sacosCimento = Math.ceil(kgCimento / 50);
  }

  let materiaisReboco = null;
  if (ladosReboco && ladosReboco > 0) {
    const volumeRebocoM3 = (areaFinal * ladosReboco) * (espessuraReboco / 100);
    materiaisReboco = {
      lados: ladosReboco,
      espessura: espessuraReboco,
      sacosCimento: Math.ceil((volumeRebocoM3 * 400) / 50),
      areiaM3: arredondarAreia(volumeRebocoM3 * 1.2)
    };
  }
  return reply.send({ sucesso: true, areaTotalLiquida: areaFinal, quantidadeTijolos: Math.ceil(quantidadeTijolos), materiaisMassa, materiaisReboco });
});

// ==========================================
// ROTA 2: CALCULADORA DE PISOS 
// ==========================================
fastify.post('/api/calcular-pisos', async (request, reply) => {
  const { larguraAmbiente, comprimentoAmbiente, larguraPiso, comprimentoPiso, margemPerda, tipoArgamassa, espessuraPiso, espessuraRejunte } = request.body;
  const areaAmbiente = larguraAmbiente * comprimentoAmbiente;
  const areaComPerda = areaAmbiente * (1 + (margemPerda / 100));
  const areaPisoMetros = (larguraPiso / 100) * (comprimentoPiso / 100);
  const quantidadePisos = Math.ceil(areaComPerda / areaPisoMetros);
  let consumoArgamassaKgM2 = (larguraPiso >= 30 && comprimentoPiso >= 30) ? 8 : 4;
  const totalArgamassaKg = areaComPerda * consumoArgamassaKgM2;
  const sacosArgamassa = Math.ceil(totalArgamassaKg / 20);

  const L = comprimentoPiso * 10;
  const W = larguraPiso * 10;
  const E = espessuraPiso;
  const J = espessuraRejunte;
  const consumoRejunteKgM2 = ((L + W) / (L * W)) * E * J * 1.58;
  const totalRejunteKg = Math.ceil(areaComPerda * consumoRejunteKgM2 * 1.10);

  return reply.send({ sucesso: true, areaAmbiente, areaComPerda, quantidadePisos, argamassa: { tipo: tipoArgamassa.toUpperCase(), sacos: sacosArgamassa }, rejunteKg: totalRejunteKg });
});

// ==========================================
// ROTA 3: CALCULADORA DE CONCRETO (NOVA!)
// ==========================================
fastify.post('/api/calcular-concreto', async (request, reply) => {
  const { tipoEstrutura, resistencia, quantidade, comprimento, largura, espessura, incluirFerragem, tipoFerragemLaje, tipoFerragemEstrutura } = request.body;

  // 1. Cálculo de Volume (m³)
  const volumeUnitario = comprimento * largura * espessura;
  const volumeTotal = volumeUnitario * quantidade;

  // 2. Cálculo dos Materiais Base (Cimento, Areia, Brita) por m³
  let cimentoPorM3 = resistencia === 'estrutural' ? 7 : 5; // Sacos de 50kg
  let areiaPorM3 = resistencia === 'estrutural' ? 0.5 : 0.7; // m³
  let britaPorM3 = 0.6; // m³

  const totalCimento = Math.ceil(volumeTotal * cimentoPorM3);
  const totalAreia = arredondarAreia(volumeTotal * areiaPorM3);
  const totalBrita = arredondarAreia(volumeTotal * britaPorM3);

  // 3. Cálculo de Ferragens (Se selecionado)
  let ferragem = null;

  if (incluirFerragem) {
    const areaTotal = comprimento * largura * quantidade;

    if (tipoEstrutura === 'laje') {
      if (tipoFerragemLaje === 'malha') {
        // Painel de Malha Pop padrão é 2x3m (6m²). Colocamos 10% de transpasse.
        const qtdMalhas = Math.ceil((areaTotal * 1.10) / 6);
        ferragem = { tipo: 'Malha Pop (2x3m)', quantidade: qtdMalhas, unidade: 'painéis' };
      } else if (tipoFerragemLaje === 'trelica') {
        // Treliças a cada 40cm (0.4m)
        const metrosLineares = Math.ceil((areaTotal / 0.4));
        ferragem = { tipo: 'Treliças', quantidade: metrosLineares, unidade: 'metros lineares' };
      }
    } else { // Pilar, Viga ou Sapata
      if (tipoFerragemEstrutura === 'pronta') {
        // Coluna armada pronta (Venda por metro linear total)
        const metrosLineares = Math.ceil(comprimento * quantidade);
        ferragem = { tipo: 'Coluna/Viga Armada', quantidade: metrosLineares, unidade: 'metros lineares' };
      } else if (tipoFerragemEstrutura === 'barra') {
        // Barras de 12 metros para montar na obra
        // Considera 4 barras principais longitudinais
        const metrosPrincipais = comprimento * 4 * quantidade;
        const barrasPrincipais = Math.ceil(metrosPrincipais / 12);
        
        // Estribos a cada 15cm
        const perimetro = (largura + espessura) * 2;
        const qtdEstribos = (comprimento / 0.15) * quantidade;
        const metrosEstribos = qtdEstribos * perimetro;
        const barrasEstribos = Math.ceil(metrosEstribos / 12);

        ferragem = { 
          tipo: 'Ferros em Barras (12m)', 
          quantidade: barrasPrincipais, 
          unidade: 'barras 3/8 (10mm) p/ estrutura',
          detalhe: `${barrasEstribos} barras de 4.2mm ou 5mm p/ estribos`
        };
      }
    }
  }

  return reply.send({
    sucesso: true,
    volumeTotal: volumeTotal,
    cimentoSacos: totalCimento,
    areiaM3: totalAreia,
    britaM3: totalBrita,
    ferragem: ferragem
  });
});

const start = async () => {
  try {
    // 1. Pega a porta do Render (quando estiver na nuvem) ou usa a 3000 (no seu PC)
    const port = process.env.PORT || 3000;
    
    // 2. O host '0.0.0.0' é OBRIGATÓRIO no Fastify para funcionar na nuvem!
    await fastify.listen({ port: port, host: '0.0.0.0' });
    
    console.log(`🚀 Servidor rodando na porta ${port} com Concreto e Ferragens!`);
  } catch (erro) {
    fastify.log.error(erro);
    process.exit(1);
  }
};

// ======================================================================
// ROTA: CALCULADORA DE TELHADO E COBERTURA
// ======================================================================
fastify.post('/api/calcular-telhado', async (request, reply) => {
  const { 
    largura, 
    comprimento, 
    beiral, 
    qtdBeiraisCaida, 
    qtdBeiraisLateral, 
    sentidoCaimento,
    qtdAguas, // 1 ou 2
    tipoTelha, // 'fibrocimento' ou 'barro'
    espessuraFibrocimento, 
    calcularMadeiramento,
    incluirMadeiraPesada
  } = request.body;

  // 1. DEFINIÇÃO DA GEOMETRIA DO TELHADO
  let vaoCaida = 0;
  let vaoCumeeira = 0;

  if (sentidoCaimento === 'laterais') {
    vaoCaida = largura;
    vaoCumeeira = comprimento;
  } else {
    vaoCaida = comprimento;
    vaoCumeeira = largura;
  }

  // A cumeeira cresce baseada nos beirais laterais
  const extensaoCumeeira = vaoCumeeira + (beiral * qtdBeiraisLateral);

  let descida1 = 0;
  let descida2 = 0;

  if (qtdAguas === 1) {
    // 1 Água: A queda ocupa o vão inteiro + os beirais selecionados na caída
    descida1 = vaoCaida + (beiral * qtdBeiraisCaida);
    descida2 = 0; // Não tem o outro lado
  } else {
    // 2 Águas: Divide o vão no meio
    descida1 = (vaoCaida / 2) + (qtdBeiraisCaida >= 1 ? beiral : 0);
    descida2 = (vaoCaida / 2) + (qtdBeiraisCaida === 2 ? beiral : 0);
  }

  const areaTotalTelhado = extensaoCumeeira * (descida1 + descida2);

  let resultadoTelhas = {};

  // 2. CÁLCULO DE TELHAS (BARRO VS FIBROCIMENTO)
  if (tipoTelha === 'barro') {
    // Telha de Barro/Cerâmica: Cálculo por m²
    const rendimentoPorM2 = 16; // 16 telhas por m² (Média Romana/Portuguesa)
    const cumeeirasPorMetro = 3; // 3 cumeeiras por metro linear
    
    resultadoTelhas = {
      tipo: 'Barro/Cerâmica',
      areaM2: areaTotalTelhado.toFixed(2),
      quantidade: Math.ceil(areaTotalTelhado * rendimentoPorM2),
      cumeeiras: Math.ceil(extensaoCumeeira * cumeeirasPorMetro)
    };

  } else {
    // Telha de Fibrocimento: Mix Inteligente
    const qtdCumeeiras = Math.ceil(extensaoCumeeira / 1.05);
    const fileirasLargura = Math.ceil(extensaoCumeeira / 1.05);

    function calcularMixLinha(descida, espessura) {
      if (descida <= 0) return {};
      let tamanhos = [1.22, 1.53, 1.83, 2.13, 2.44, 3.05, 3.66];
      if (espessura === 6) tamanhos = tamanhos.filter(t => t !== 3.05);

      let restante = descida;
      let mix = {};
      let primeira = true;

      while (restante > 0.05) {
        let alvo = primeira ? restante : restante + 0.20; // 20cm de transpasse
        let chapa = 0;
        
        if (alvo >= 2.44) {
            chapa = 2.44;
        } else {
            chapa = tamanhos.find(t => t >= alvo);
            if (!chapa) chapa = tamanhos[tamanhos.length - 1];
        }

        mix[`${chapa}m`] = (mix[`${chapa}m`] || 0) + 1;
        restante -= (primeira ? chapa : chapa - 0.20);
        primeira = false;
      }
      return mix;
    }

    const mixLado1 = calcularMixLinha(descida1, espessuraFibrocimento);
    const mixLado2 = calcularMixLinha(descida2, espessuraFibrocimento);

    let mixFinalAgrupado = {};
    function adicionarAoMix(mixLado) {
      for (let tam in mixLado) {
        mixFinalAgrupado[tam] = (mixFinalAgrupado[tam] || 0) + (mixLado[tam] * fileirasLargura);
      }
    }
    adicionarAoMix(mixLado1);
    adicionarAoMix(mixLado2);

    resultadoTelhas = {
      tipo: 'Fibrocimento',
      espessura: espessuraFibrocimento,
      cumeeiras: qtdCumeeiras,
      mixChapas: Object.keys(mixFinalAgrupado).map(tamanho => ({
        tamanho: tamanho,
        quantidade: mixFinalAgrupado[tamanho]
      }))
    };
  }

  // 3. CÁLCULO DO MADEIRAMENTO
  let madeiras = [];
  if (calcularMadeiramento) {
    // Para telha de barro as ripas seriam diferentes, mas mantive as guias do fibrocimento como base da estrutura para simplificar. 
    // Você pode ajustar as distâncias aqui depois.
    const espacamentoGuias = tipoTelha === 'barro' ? 0.32 : 1.10; // Ex: Ripas a cada 32cm para barro
    const linhasGuiasL1 = descida1 > 0 ? Math.ceil(descida1 / espacamentoGuias) + 1 : 0;
    const linhasGuiasL2 = descida2 > 0 ? Math.ceil(descida2 / espacamentoGuias) + 1 : 0;
    
    const metrosLinearesGuias = (linhasGuiasL1 + linhasGuiasL2) * extensaoCumeeira;
    const pecasGuias = Math.ceil(metrosLinearesGuias / 5.50);
    madeiras.push({ nome: tipoTelha === 'barro' ? 'Ripa/Guia (Apoio das telhas)' : 'Guia 2,5 x 10 x 550 (Para pregar a telha)', quantidade: pecasGuias });

    const qtdCaibros = Math.ceil(extensaoCumeeira / 0.50) + 1;
    const metrosLinearesCaibros = qtdCaibros * (descida1 + descida2);
    const pecasCaibros = Math.ceil(metrosLinearesCaibros / 5.50);
    madeiras.push({ nome: 'Caibro 5 x 10 x 550 (Apoio das ripas/guias)', quantidade: pecasCaibros });

    if (incluirMadeiraPesada) {
      const qtdTesouras = Math.ceil(extensaoCumeeira / 2.0) + 1;
      const metrosMadeiraPorTesoura = (descida1 + descida2) * 2.5; 
      const totalPecasTesoura = Math.ceil((qtdTesouras * metrosMadeiraPorTesoura) / 5.50);
      madeiras.push({ nome: 'Guia 2,5 x 15 x 550 (Madeira para Tesouras)', quantidade: totalPecasTesoura });
    }
  }

  return reply.send({
    sucesso: true,
    dadosCobrimento: {
      extensaoCumeeira: extensaoCumeeira.toFixed(2),
      descida1: descida1.toFixed(2),
      descida2: descida2.toFixed(2),
      qtdAguas: qtdAguas
    },
    telhas: resultadoTelhas,
    madeiras: madeiras
  });
});

start();