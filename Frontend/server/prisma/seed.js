import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ZONES = [
  { name: 'North Market', shortName: 'North', centerLat: 15.3730, centerLng: 75.1240 },
  { name: 'Lakeview Ward', shortName: 'Lakeview', centerLat: 15.3650, centerLng: 75.1150 },
  { name: 'Civic Centre', shortName: 'Civic', centerLat: 15.3570, centerLng: 75.1320 },
  { name: 'East Campus', shortName: 'East', centerLat: 15.3690, centerLng: 75.1420 },
  { name: 'Riverside', shortName: 'River', centerLat: 15.3510, centerLng: 75.1190 },
  { name: 'South Gate', shortName: 'South', centerLat: 15.3450, centerLng: 75.1280 },
];

// 8 bin offsets per zone (spread ~200-500m around zone center)
const BIN_OFFSETS = [
  { dx: 0.0012, dy: 0.0008 },
  { dx: -0.0010, dy: 0.0015 },
  { dx: 0.0018, dy: -0.0005 },
  { dx: -0.0015, dy: -0.0012 },
  { dx: 0.0005, dy: 0.0020 },
  { dx: -0.0020, dy: 0.0003 },
  { dx: 0.0008, dy: -0.0018 },
  { dx: -0.0003, dy: -0.0008 },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Software Admin
  const passwordHash = await bcrypt.hash('Software@123', 12);
  const softwareAdmin = await prisma.user.upsert({
    where: { email: 'softwareadmin@gmail.com' },
    update: { passwordHash, role: 'SOFTWARE_ADMIN', name: 'Software Admin', isActive: true },
    create: {
      email: 'softwareadmin@gmail.com',
      passwordHash,
      name: 'Software Admin',
      phone: '+91 00000 00000',
      role: 'SOFTWARE_ADMIN',
      isActive: true,
    },
  });
  console.log(`   ✅ Software Admin: ${softwareAdmin.email}`);

  // 2. Create 6 Zones with 8 Smart Bins each
  for (const zoneData of ZONES) {
    const zone = await prisma.zone.upsert({
      where: { name: zoneData.name },
      update: { shortName: zoneData.shortName, centerLat: zoneData.centerLat, centerLng: zoneData.centerLng },
      create: zoneData,
    });

    // Create 8 smart bins per zone
    const prefix = zoneData.shortName.slice(0, 2).toUpperCase();
    for (let i = 0; i < BIN_OFFSETS.length; i++) {
      const offset = BIN_OFFSETS[i];
      const label = `${prefix}-${String(i + 1).padStart(2, '0')}`;
      const lat = zoneData.centerLat + offset.dx;
      const lng = zoneData.centerLng + offset.dy;

      const existingBin = await prisma.smartBin.findFirst({ where: { label, zoneId: zone.id } });
      if (!existingBin) {
        await prisma.smartBin.create({
          data: { label, lat, lng, fillLevel: Math.floor(Math.random() * 85) + 10, zoneId: zone.id },
        });
      }
    }
    console.log(`   ✅ Zone "${zoneData.name}" + 8 bins`);
  }

  console.log('\n🎉 Seed complete! 1 admin + 6 zones + 48 smart bins\n');
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
