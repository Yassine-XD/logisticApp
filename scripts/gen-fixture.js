// scripts/gen-fixture.js
// Generates an ANONYMIZED demo fixture derived from the SIGNUS albRec structure.
// Fake garage names/phones; real-ish Barcelona/Bages coordinates.
// Dates are stored as day-offsets from "now" so the demo never goes stale;
// the mock SIGNUS client (src/integrations/signus.client.js) materializes them.
const fs = require("fs");
const path = require("path");

// Town centers across Barcelona province + Bages (Manresa) with jitter radius.
const AREAS = [
  { city: "Manresa", municipio: "Manresa", cp: "08240", prov: "Barcelona", lat: 41.7286, lng: 1.8235 },
  { city: "Sant Fruitós de Bages", municipio: "Sant Fruitós de Bages", cp: "08272", prov: "Barcelona", lat: 41.7515, lng: 1.8776 },
  { city: "Sallent", municipio: "Sallent", cp: "08650", prov: "Barcelona", lat: 41.8265, lng: 1.8965 },
  { city: "Igualada", municipio: "Igualada", cp: "08700", prov: "Barcelona", lat: 41.5791, lng: 1.6174 },
  { city: "Vic", municipio: "Vic", cp: "08500", prov: "Barcelona", lat: 41.9301, lng: 2.2549 },
  { city: "Terrassa", municipio: "Terrassa", cp: "08224", prov: "Barcelona", lat: 41.5650, lng: 1.9964 },
  { city: "Sabadell", municipio: "Sabadell", cp: "08201", prov: "Barcelona", lat: 41.5486, lng: 2.1074 },
  { city: "Barcelona", municipio: "Barcelona", cp: "08013", prov: "Barcelona", lat: 41.3980, lng: 2.1830 },
  { city: "Cornellà de Llobregat", municipio: "Cornellà de Llobregat", cp: "08940", prov: "Barcelona", lat: 41.3532, lng: 2.0747 },
  { city: "Granollers", municipio: "Granollers", cp: "08400", prov: "Barcelona", lat: 41.6083, lng: 2.2874 },
  { city: "Mataró", municipio: "Mataró", cp: "08302", prov: "Barcelona", lat: 41.5388, lng: 2.4449 },
  { city: "Vilanova del Camí", municipio: "Vilanova del Camí", cp: "08788", prov: "Barcelona", lat: 41.5637, lng: 1.6389 },
];

const BRANDS = [
  "Talleres", "Auto", "Neumáticos", "Garatge", "Pneumàtics", "Motor", "Recanvis",
  "Servei", "Car Center", "RuedaExpress", "Taller Mecànic",
];
const SUFFIX = [
  "Montseny", "Llobregat", "Bages", "Nord", "Central", "Express", "2000",
  "del Vallès", "Cardener", "Anoia", " Segle XXI", "Germans Soler", "La Plana",
  "Vic", "Ripoll", "Sant Jordi", "Montserrat", "Freixe", "Comas", "Prat",
];
const STREETS = [
  "C/ Indústria", "Av. Bases de Manresa", "C/ Sant Antoni", "Ctra. de Vic",
  "Pol. Ind. Els Trullols", "C/ Barcelona", "Av. Catalunya", "C/ Major",
  "C/ del Carme", "Ronda dels Països Catalans", "C/ Guimerà", "Pg. del Riu",
];
const PRODUCTS = ["SCPQ2", "SCPQ1", "SCTL4", "SCFU3"];

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function pick(arr) { return arr[rndInt(0, arr.length - 1)]; }

const N = 72;
const URGENT_COUNT = 11; // ~10 with deadline within 2 days
const records = [];
let code = 3300000;

for (let i = 0; i < N; i++) {
  const area = pick(AREAS);
  const lat = +(area.lat + rnd(-0.02, 0.02)).toFixed(5);
  const lng = +(area.lng + rnd(-0.02, 0.02)).toFixed(5);

  // Units → kg (avg tire weight blend ~ 8.6–20 kg/unit for a mix)
  const units = rndInt(20, 260);
  const kg = Math.max(200, Math.min(4000, Math.round(units * rnd(8.6, 16))));

  // Deadline spread. First URGENT_COUNT get ≤2 days; rest 3–20 days.
  const isUrgent = i < URGENT_COUNT;
  const deadlineOffset = isUrgent ? rndInt(0, 2) : rndInt(3, 20);
  // Requested 4–25 days ago
  const requestedOffset = -rndInt(4, 25);

  // State spread: mostly EN_CURSO, some ASIGNADA / EN_TRANSITO
  const r = Math.random();
  const estadoCod = r < 0.7 ? "EN_CURSO" : r < 0.88 ? "ASIGNADA" : "EN_TRANSITO";
  const estado = estadoCod === "EN_CURSO" ? "Aceptada" : estadoCod === "ASIGNADA" ? "Asignada" : "En tránsito";

  const name = `${pick(BRANDS)} ${pick(SUFFIX)}`.toUpperCase();

  records.push({
    codigo: code++,
    estadoCod,
    estado,
    tipoRecogidaCod: "M",
    tipoRecogida: "Manual",
    // NOTE: relative offsets, materialized to real dates by the mock client.
    _requestedDayOffset: requestedOffset,
    _deadlineDayOffset: deadlineOffset,
    kgSolicitadosEstimados: kg,
    lineasRecogidaManual: [
      { codigoProducto: pick(PRODUCTS), unidadesSolicitadas: units, unidadesRecogidas: 0, pesoRecogidoKg: 0 },
    ],
    kgRecogidosEstimados: 0,
    codigoPgnu: `G0${rndInt(800000, 899999)}`,
    nombrePgnu: name,
    telefonoPgnu: `9${rndInt(30, 38)}${rndInt(100000, 999999)}`,
    latitud: lat,
    longitud: lng,
    pais: "España",
    comunidad: "Cataluña",
    provincia: area.prov,
    municipio: area.municipio,
    direccion: `${pick(STREETS)}, ${rndInt(1, 180)}`,
    codigoPostal: area.cp,
    localidad: area.city.toUpperCase(),
    codigoCrc: "R0805",
    razonSocialCrc: "VOLALTE DEMO, S.L.",
  });
}

const out = {
  _comment:
    "Anonymized demo fixture derived from the SIGNUS albRecs response structure. " +
    "Fake garage names/phones; real-ish coordinates. Dates are day-offsets from now, " +
    "materialized at read time by the mock SIGNUS client so the demo never goes stale.",
  msgCodigo: 0,
  msgDescripcion: "Operación realizada correctamente.",
  data: records,
};

const dest = path.join(__dirname, "..", "src", "fixtures", "demo-demands.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`Wrote ${records.length} demands → ${dest}`);
console.log(`Urgent (≤2d): ${URGENT_COUNT}`);
