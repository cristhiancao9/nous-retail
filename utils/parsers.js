// utils/parsers.js
const { XMLParser } = require('fast-xml-parser');

// Nuevo Parser Híbrido (Código + Texto)
const parseKoajItem = (refFull, descripcion_limpia) => {
 const [codigo, color] = refFull.split('-');

 // 1. GÉNERO (Extraído del código numérico)
 let genero = 'unisex';
 if (codigo && codigo.length >= 4) {
  const genCode = codigo.substring(2, 4);
  if (genCode === '51') genero = 'hombre';
  else if (genCode === '52') genero = 'mujer';
 }

 // Parche para insumos/bolsas (Códigos cortos)
 if (!codigo || codigo.length < 10) {
  return {
   genero: 'unisex',
   familia: 'empaque',
   nombre_diseno: descripcion_limpia,
   temporada: null,
   color: color || '000'
  };
 }

 // 2. FAMILIA (Extraída de la primera palabra del texto)
 const primeraPalabra = descripcion_limpia.split(' ')[0].toUpperCase();
 const mapaFamilias = {
  'CAMISETA': 'camiseta', 'TOP': 'camiseta', 'POLO': 'camiseta',
  'CAMISA': 'camisa', 'BLUSA': 'camisa',
  'BUZO': 'buzo', 'CHAQUETA': 'chaqueta', 'CHALECO': 'chaqueta', 'SWEATER': 'buzo',
  'PANTALON': 'jean', 'JEAN': 'jean', 'SUDADERA': 'pantalón', 'JOGGER': 'pantalón',
  'SHORT': 'short', 'BERMUDA': 'short', 'PANTALONETA': 'short',
  'VESTIDO': 'vestido', 'ENTERIZO': 'vestido', 'FALDA': 'vestido',
  'ZAPATOS': 'calzado', 'TENIS': 'calzado', 'BOTAS': 'calzado', 'SANDALIAS': 'calzado',
  'BOXER': 'ropa_interior', 'MEDIAS': 'ropa_interior', 'PANTY': 'ropa_interior', 'BRASIER': 'ropa_interior',
  'GORRA': 'accesorio', 'CINTURON': 'accesorio', 'BILLETERA': 'accesorio', 'GAFAS': 'accesorio', 'MORRAL': 'accesorio', 'BOLSO': 'accesorio'
 };
 const familia = mapaFamilias[primeraPalabra] || 'otro';

 // 3. EXTRACCIÓN DEL DISEÑO LIMPIO Y TEMPORADA
 const partes = descripcion_limpia.split(' ');
 let temporada = null;

 // A. Extraer temporada del final (Ej: "4/24" o "1/25")
 const ultimaParte = partes[partes.length - 1];
 if (ultimaParte && ultimaParte.match(/^\d{1,2}\/\d{2}$/)) {
  temporada = ultimaParte;
  partes.pop(); // Lo quitamos del nombre
 }

 // B. Quitar el código interno suelto que dejan a veces (Ej: "4883")
 const penultimaParte = partes[partes.length - 1];
 if (penultimaParte && penultimaParte.match(/^\d+$/)) {
  partes.pop();
 }

 // C. Limpiar "CAMISA KOAJ" del principio para que quede solo el diseño comercial
 let nombre_diseno = partes.join(' ');
 const regexLimpieza = new RegExp(`^${primeraPalabra}(\\s+KOAJ)?\\s+`, 'i');
 nombre_diseno = nombre_diseno.replace(regexLimpieza, '').trim();

 return {
  genero,
  familia,
  nombre_diseno: nombre_diseno || descripcion_limpia,
  temporada,
  color: color || '000'
 };
};

// Parser del XML de Factura
const parseKoajXML = (xmlBuffer) => {
 const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
 const jsonObj = parser.parse(xmlBuffer.toString());

 const innerXMLString = jsonObj.AttachedDocument?.Attachment?.ExternalReference?.Description;
 if (!innerXMLString) throw new Error('No se encontró la factura UBL incrustada.');

 const innerInvoice = parser.parse(innerXMLString).Invoice;
 let lines = innerInvoice.InvoiceLine;
 if (!Array.isArray(lines)) lines = [lines];

 const parsedItems = lines.map(line => {
  const descripcion = line.Item?.Description || '';
  const tallaMatch = descripcion.match(/Talla:\s*(\w+)/);
  const colorMatch = descripcion.match(/Color:\s*(\d+)/);
  const precio_sin_iva = parseFloat(line.Price?.PriceAmount || 0);
  const descuento_pct = parseFloat(line.AllowanceCharge?.MultiplierFactorNumeric || 0);

  return {
   referencia_base: line.Item?.SellersItemIdentification?.ID?.toString() || '0000',
   nombre_koaj: descripcion.split('\n')[0].trim(),
   talla: tallaMatch ? tallaMatch[1] : 'UN',
   color: colorMatch ? colorMatch[1] : '000',
   cantidad: parseInt(line.InvoicedQuantity || 1, 10),
   precio_sin_iva,
   descuento_pct
  };
 });

 return {
  factura_koaj: innerInvoice.ID,
  fecha_factura: innerInvoice.IssueDate,
  items: parsedItems
 };
};

module.exports = { parseKoajItem, parseKoajXML };