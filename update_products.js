const fs = require('fs');

const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));

const kuba = {
  id: "ul-kuba-queen-bed",
  name: "Kuba Solid Wood Queen Size Bed With Hydraulic Storage",
  category: "Bedroom",
  subcategory: "Beds",
  product_short_name: "Kuba",
  design_details: "headboard with vertical and chevron groove detailing, floating headboard effect",
  price: 60000,
  dimensions: "Length 2.05 m x Width 1.6 m x Height 1.0 m",
  primary_material: "Sheesham wood",
  weight: "120 kg",
  assembly_required: "Requires Assembly",
  warranty_months: 12,
  variant_axes: {
    size: ["King", "Queen"],
    storage_type: ["Non-storage", "Drawer", "Box", "Hydraulic"],
    finish: ["Teak", "Mahogany"],
    colour: []
  },
  mattress_recommendation: {
    size: "King - 78 x 72 inches; Queen - 78 x 60 inches",
    thickness_range: "4-8 inches"
  }
};

const nimbus = {
  id: "ul-nimbus-king-bed",
  name: "Nimbus Solid Wood King Size Bed Without Storage",
  category: "Bedroom",
  subcategory: "Beds",
  product_short_name: "Nimbus",
  design_details: "curvilinear silhouette, metal inlay tracing the headboard, rounded corners",
  price: 55000,
  dimensions: "Length 2.05 m x Width 1.8 m x Height 1.0 m",
  primary_material: "Sheesham wood",
  weight: "110 kg",
  assembly_required: "Requires Assembly",
  warranty_months: 12,
  variant_axes: {
    size: [],
    storage_type: ["Non-storage", "Box", "Drawer", "Hydraulic"],
    finish: ["Teak", "Mahogany"],
    colour: []
  },
  mattress_recommendation: {
    size: "King - 78 x 72 inches; Queen - 78 x 60 inches"
  }
};

const milan = {
  id: "ul-milan-queen-bed",
  name: "Milan Engineered Wood Queen Size Bed With Hydraulic Storage",
  category: "Bedroom",
  subcategory: "Beds",
  product_short_name: "Milan",
  design_details: "velvet headboard, graceful pleats, gold-finish staple accent",
  price: 45000,
  dimensions: "Length 2.05 m x Width 1.6 m x Height 1.0 m",
  primary_material: "Engineered wood",
  weight: "130 kg",
  assembly_required: "Requires Assembly",
  warranty_months: 12,
  variant_axes: {
    size: ["King", "Queen"],
    storage_type: ["Hydraulic", "fabric hand-pull"],
    finish: [],
    colour: ["Deep Olive", "Deep Crimson", "Mocha Mousse"]
  },
  mattress_recommendation: {
    size: "King - 72 x 78 inches; Queen - 60 x 78 inches",
    thickness_range: "4 to 6 inches"
  }
};

// Also apply the new schema fields as empty/default to the first item just in case.
if (products.length > 0 && !products[0].subcategory) {
  products.forEach(p => {
    p.subcategory = p.subcategory || p.category;
    p.product_short_name = p.product_short_name || p.name.split(' ')[0];
    p.design_details = p.design_details || "standard minimal design";
    p.variant_axes = p.variant_axes || {
      size: p.available_sizes || (p.seating_capacity ? [p.seating_capacity] : []),
      storage_type: [],
      finish: p.available_colors || (p.color_finish ? [p.color_finish] : []),
      colour: p.available_colors || (p.color_finish ? [p.color_finish] : [])
    };
  });
}

// Remove duplicates if we run this script multiple times
const existingIds = products.map(p => p.id);
if (!existingIds.includes(kuba.id)) products.push(kuba);
if (!existingIds.includes(nimbus.id)) products.push(nimbus);
if (!existingIds.includes(milan.id)) products.push(milan);

fs.writeFileSync('data/products.json', JSON.stringify(products, null, 2));
console.log('Successfully updated products.json');
