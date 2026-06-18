// v2 - tolerant matching
/* =========================================================
 * FullPro Media Club · Catálogo de Motos
 *
 * Lista de marcas, modelos e anos disponíveis para
 * agendamento no Media Club. Usado na landing page e admin.
 *
 * Formato: { marca: string, modelos: [{ nome, slug, anos: [number] }] }
 *   - slug: identificador sem espaço para busca no Bling
 *     (ex: "CB650R", "CBR500R", "R1300GS")
 * ========================================================= */
window.MOTO_CATALOG = [
  {
    marca: 'Honda',
    modelos: [
      { nome: 'Biz 125', slug: 'BIZ125', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Bros 160', slug: 'BROS160', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CB 300F Twister', slug: 'CB300F', anos: [2023,2024,2025,2026] },
      { nome: 'CB 500F', slug: 'CB500F', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CB 500X', slug: 'CB500X', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CB 650R', slug: 'CB650R', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CB 1000R', slug: 'CB1000R', anos: [2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'CBR 500R', slug: 'CBR500R', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CBR 600RR', slug: 'CBR600RR', anos: [2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'CBR 650R', slug: 'CBR650R', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CBR 1000RR Fireblade', slug: 'CBR1000RR', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'CG 160', slug: 'CG160', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CRF 250F', slug: 'CRF250F', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'CRF 300L', slug: 'CRF300L', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'CRF 1100L Africa Twin', slug: 'AFRICATWIN', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Forza 350', slug: 'FORZA350', anos: [2023,2024,2025,2026] },
      { nome: 'NC 750X', slug: 'NC750X', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'NX 400 Sahara', slug: 'NX400', anos: [2024,2025,2026] },
      { nome: 'PCX 160', slug: 'PCX160', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Pop 110i', slug: 'POP110', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'SH 150i', slug: 'SH150I', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'Titan 160', slug: 'TITAN160', anos: [2022,2023,2024,2025,2026] },
      { nome: 'XRE 190', slug: 'XRE190', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'XRE 300', slug: 'XRE300', anos: [2019,2020,2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Yamaha',
    modelos: [
      { nome: 'Crosser 150', slug: 'CROSSER150', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Factor 150', slug: 'FACTOR150', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Fazer 250', slug: 'FAZER250', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Fluo 125', slug: 'FLUO125', anos: [2024,2025,2026] },
      { nome: 'Lander 250', slug: 'LANDER250', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'MT-03', slug: 'MT03', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'MT-07', slug: 'MT07', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'MT-09', slug: 'MT09', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'MT-09 Tracer / Tracer 9', slug: 'TRACER9', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'NMAX 160', slug: 'NMAX160', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'R1', slug: 'YZF-R1', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024] },
      { nome: 'R3', slug: 'YZF-R3', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'R7', slug: 'YZF-R7', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Ténéré 250', slug: 'TENERE250', anos: [2016,2017,2018,2019,2020,2021] },
      { nome: 'Ténéré 700', slug: 'TENERE700', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'XJ6', slug: 'XJ6', anos: [2010,2011,2012,2013,2014,2015,2016,2017,2018] },
      { nome: 'XMax 250', slug: 'XMAX250', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'XTZ 150 Crosser', slug: 'XTZ150', anos: [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'XTZ 250 Ténéré', slug: 'XTZ250', anos: [2014,2015,2016,2017,2018,2019,2020,2021] }
    ]
  },
  {
    marca: 'BMW',
    modelos: [
      { nome: 'F 750 GS', slug: 'F750GS', anos: [2018,2019,2020,2021,2022,2023,2024] },
      { nome: 'F 800 GS', slug: 'F800GS', anos: [2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018] },
      { nome: 'F 850 GS', slug: 'F850GS', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'F 900 R', slug: 'F900R', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'F 900 XR', slug: 'F900XR', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'G 310 GS', slug: 'G310GS', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'G 310 R', slug: 'G310R', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'R 1250 GS', slug: 'R1250GS', anos: [2019,2020,2021,2022,2023,2024] },
      { nome: 'R 1250 GS Adventure', slug: 'R1250GSA', anos: [2019,2020,2021,2022,2023,2024] },
      { nome: 'R 1300 GS', slug: 'R1300GS', anos: [2024,2025,2026] },
      { nome: 'S 1000 R', slug: 'S1000R', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'S 1000 RR', slug: 'S1000RR', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'S 1000 XR', slug: 'S1000XR', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Kawasaki',
    modelos: [
      { nome: 'Ninja 300', slug: 'NINJA300', anos: [2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'Ninja 400', slug: 'NINJA400', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Ninja 650', slug: 'NINJA650', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Ninja 1000 SX', slug: 'NINJA1000SX', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Ninja ZX-6R', slug: 'ZX6R', anos: [2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'Ninja ZX-10R', slug: 'ZX10R', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Versys 650', slug: 'VERSYS650', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Versys 1000', slug: 'VERSYS1000', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Vulcan S', slug: 'VULCANS', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Z400', slug: 'Z400', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Z650', slug: 'Z650', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Z900', slug: 'Z900', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'ZX-4RR', slug: 'ZX4RR', anos: [2024,2025,2026] }
    ]
  },
  {
    marca: 'Suzuki',
    modelos: [
      { nome: 'Boulevard M800', slug: 'M800', anos: [2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024] },
      { nome: 'DL 650 V-Strom', slug: 'VSTROM650', anos: [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'DL 1000 V-Strom', slug: 'VSTROM1000', anos: [2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'DL 1050 V-Strom', slug: 'VSTROM1050', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'GSX-R 750 SRAD', slug: 'GSXR750', anos: [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'GSX-R 1000', slug: 'GSXR1000', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'GSX-S 750', slug: 'GSXS750', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'GSX-S 1000', slug: 'GSXS1000', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Hayabusa', slug: 'HAYABUSA', anos: [2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'SV 650', slug: 'SV650', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Ducati',
    modelos: [
      { nome: 'Diavel', slug: 'DIAVEL', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'Hypermotard 950', slug: 'HYPERMOTARD950', anos: [2019,2020,2021,2022,2023,2024,2025] },
      { nome: 'Monster', slug: 'MONSTER', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Multistrada V2', slug: 'MULTISTRADAV2', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Multistrada V4', slug: 'MULTISTRADAV4', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'Panigale V2', slug: 'PANIGALEV2', anos: [2020,2021,2022,2023,2024,2025] },
      { nome: 'Panigale V4', slug: 'PANIGALEV4', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Scrambler', slug: 'SCRAMBLER', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Streetfighter V2', slug: 'STREETFIGHTERV2', anos: [2022,2023,2024,2025] },
      { nome: 'Streetfighter V4', slug: 'STREETFIGHTERV4', anos: [2020,2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Triumph',
    modelos: [
      { nome: 'Bonneville T120', slug: 'BONNEVILLET120', anos: [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Speed Triple 1200', slug: 'SPEEDTRIPLE1200', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'Street Triple 765', slug: 'STREETTRIPLE765', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Tiger 800', slug: 'TIGER800', anos: [2015,2016,2017,2018,2019,2020] },
      { nome: 'Tiger 900', slug: 'TIGER900', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Tiger 1200', slug: 'TIGER1200', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Trident 660', slug: 'TRIDENT660', anos: [2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'KTM',
    modelos: [
      { nome: '390 Adventure', slug: '390ADV', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: '390 Duke', slug: '390DUKE', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: '790 Adventure', slug: '790ADV', anos: [2019,2020,2021,2022,2023] },
      { nome: '890 Adventure', slug: '890ADV', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: '890 Duke', slug: '890DUKE', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: '1290 Super Adventure', slug: '1290SUPERADV', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: '1290 Super Duke R', slug: '1290SUPERDUKER', anos: [2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Harley-Davidson',
    modelos: [
      { nome: 'Fat Bob', slug: 'FATBOB', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Iron 883', slug: 'IRON883', anos: [2014,2015,2016,2017,2018,2019,2020,2021,2022] },
      { nome: 'Low Rider S', slug: 'LOWRIDERS', anos: [2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Pan America 1250', slug: 'PANAMERICA', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'Road Glide', slug: 'ROADGLIDE', anos: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Sportster S', slug: 'SPORTSTERS', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'Street Bob', slug: 'STREETBOB', anos: [2018,2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'X500', slug: 'X500', anos: [2024,2025,2026] }
    ]
  },
  {
    marca: 'Royal Enfield',
    modelos: [
      { nome: 'Classic 350', slug: 'CLASSIC350', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Himalayan 450', slug: 'HIMALAYAN450', anos: [2024,2025,2026] },
      { nome: 'Hunter 350', slug: 'HUNTER350', anos: [2023,2024,2025,2026] },
      { nome: 'Interceptor 650', slug: 'INTERCEPTOR650', anos: [2019,2020,2021,2022,2023,2024,2025,2026] },
      { nome: 'Meteor 350', slug: 'METEOR350', anos: [2021,2022,2023,2024,2025,2026] },
      { nome: 'Scram 411', slug: 'SCRAM411', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Super Meteor 650', slug: 'SUPERMETEOR650', anos: [2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Shineray',
    modelos: [
      { nome: 'Jet 150', slug: 'JET150', anos: [2022,2023,2024,2025,2026] },
      { nome: 'Worker 150', slug: 'WORKER150', anos: [2022,2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'Dafra',
    modelos: [
      { nome: 'NH 190', slug: 'NH190', anos: [2023,2024,2025,2026] },
      { nome: 'Apache RTR 200', slug: 'APACHE200', anos: [2023,2024,2025,2026] }
    ]
  },
  {
    marca: 'CF Moto',
    modelos: [
      { nome: 'NK 400', slug: 'NK400', anos: [2022,2023,2024,2025,2026] },
      { nome: 'MT 800', slug: 'CFMT800', anos: [2023,2024,2025,2026] },
      { nome: '800 NK', slug: '800NK', anos: [2024,2025,2026] }
    ]
  }
];

/* ── Helper: populate selects cascata ── */
window.initMotoSelects = function(marcaId, modeloId, anoId, hiddenId) {
  const marcaSel = document.getElementById(marcaId);
  const modeloSel = document.getElementById(modeloId);
  const anoSel = document.getElementById(anoId);
  const hidden = hiddenId ? document.getElementById(hiddenId) : null;

  if (!marcaSel || !modeloSel || !anoSel) return;

  // Populate brands
  marcaSel.innerHTML = '<option value="">Selecione a marca</option>' +
    MOTO_CATALOG.map(m => `<option value="${m.marca}">${m.marca}</option>`).join('');

  modeloSel.innerHTML = '<option value="">Selecione o modelo</option>';
  modeloSel.disabled = true;
  anoSel.innerHTML = '<option value="">Ano/Modelo</option>';
  anoSel.disabled = true;

  function updateHidden() {
    if (!hidden) return;
    const marca = marcaSel.value;
    const modelo = modeloSel.value;
    const ano = anoSel.value;
    hidden.value = (marca && modelo && ano) ? `${marca} ${modelo} ${ano}` : '';
  }

  marcaSel.addEventListener('change', function() {
    const brand = MOTO_CATALOG.find(m => m.marca === this.value);
    modeloSel.innerHTML = '<option value="">Selecione o modelo</option>';
    anoSel.innerHTML = '<option value="">Ano/Modelo</option>';
    anoSel.disabled = true;
    if (brand) {
      modeloSel.innerHTML += brand.modelos.map(m => `<option value="${m.nome}" data-slug="${m.slug}">${m.nome}</option>`).join('');
      modeloSel.disabled = false;
    } else {
      modeloSel.disabled = true;
    }
    updateHidden();
  });

  modeloSel.addEventListener('change', function() {
    const brand = MOTO_CATALOG.find(m => m.marca === marcaSel.value);
    const model = brand?.modelos.find(m => m.nome === this.value);
    anoSel.innerHTML = '<option value="">Ano/Modelo</option>';
    if (model) {
      const sortedYears = [...model.anos].sort((a, b) => b - a);
      anoSel.innerHTML += sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
      anoSel.disabled = false;
    } else {
      anoSel.disabled = true;
    }
    updateHidden();
  });

  anoSel.addEventListener('change', updateHidden);

  // Return setter for pre-filling from existing data
  return function setMotoValue(motoStr) {
    if (!motoStr) return;
    // Try to parse "Marca Modelo Ano" e.g. "Honda CB 650R 2023"
    const parts = motoStr.trim();
    let matched = false;
    for (const brand of MOTO_CATALOG) {
      for (const model of brand.modelos) {
        // Check if the string starts with "Brand ModelName"
        const prefix = brand.marca + ' ' + model.nome;
        if (parts.startsWith(prefix)) {
          marcaSel.value = brand.marca;
          marcaSel.dispatchEvent(new Event('change'));
          modeloSel.value = model.nome;
          modeloSel.dispatchEvent(new Event('change'));
          // Try to extract year
          const rest = parts.substring(prefix.length).trim();
          const yearMatch = rest.match(/(\d{4})/);
          if (yearMatch && model.anos.includes(parseInt(yearMatch[1]))) {
            anoSel.value = yearMatch[1];
            anoSel.dispatchEvent(new Event('change'));
          }
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched && hidden) {
      // Fallback: just set the hidden field directly for legacy data
      hidden.value = motoStr;
    }
  };
};

/* ── Helper: get slug for a moto string ── */
window.getMotoSlug = function(motoStr) {
  if (!motoStr) return null;
  const norm = s => (s || '').toLowerCase().replace(/[\s\-_]/g, '');
  const input = norm(motoStr);
  for (const brand of MOTO_CATALOG) {
    const bNorm = norm(brand.marca);
    if (!input.includes(bNorm)) continue;
    const sorted = [...brand.modelos].sort((a, b) => b.nome.length - a.nome.length);
    for (const model of sorted) {
      const mNorm = norm(model.nome);
      const sNorm = norm(model.slug);
      if (input.includes(mNorm) || input.includes(sNorm)) {
        return { marca: brand.marca, modelo: model.nome, slug: model.slug, anos: model.anos };
      }
    }
  }
  return null;
};

/* ── Helper: extract year from moto string ── */
window.getMotoYear = function(motoStr) {
  if (!motoStr) return null;
  const m = motoStr.match(/(\d{4})\s*$/);
  return m ? parseInt(m[1]) : null;
};
