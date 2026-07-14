import { ExtrudeGeometry, Shape } from 'three';
import type { BufferGeometry } from 'three';

interface RoundedPrismOptions {
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments?: number;
  edgeBevel?: number;
}

function createRoundedRectangleShape(
  width: number,
  height: number,
  radius: number
): Shape {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new Shape();

  if (width === height && radius >= halfWidth) {
    shape.absarc(0, 0, halfWidth, 0, Math.PI * 2, false);
    shape.closePath();
    return shape;
  }

  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  shape.closePath();
  return shape;
}

export function createRoundedPrismGeometry({
  width,
  height,
  depth,
  radius,
  segments = 8,
  edgeBevel = 1.25,
}: RoundedPrismOptions): BufferGeometry {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const safeBevel = Math.max(
    0,
    Math.min(edgeBevel, depth * 0.12, safeRadius * 0.12)
  );
  const geometry = new ExtrudeGeometry(
    createRoundedRectangleShape(width, height, safeRadius),
    {
      depth,
      steps: 1,
      bevelEnabled: safeBevel > 0,
      bevelSegments: 2,
      bevelSize: safeBevel,
      bevelThickness: safeBevel,
      curveSegments: segments,
    }
  );

  const capGroup = geometry.groups[0];
  const sideGroup = geometry.groups[1];
  if (!capGroup || !sideGroup) {
    throw new Error('Rounded prism material groups were not generated.');
  }

  // ExtrudeGeometry emits the back cap first and the front cap second. Split
  // them so the widget texture stays on material group 4 while the subtly
  // beveled rim, side wall and back keep the physical body material.
  const backCapCount = capGroup.count / 2;
  geometry.clearGroups();
  geometry.addGroup(capGroup.start, backCapCount, 5);
  geometry.addGroup(capGroup.start + backCapCount, backCapCount, 4);
  geometry.addGroup(sideGroup.start, sideGroup.count, 0);

  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const capEnd = capGroup.start + capGroup.count;
  for (let index = capGroup.start; index < capEnd; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + width / 2) / width,
      (position.getY(index) + height / 2) / height
    );
  }
  uv.needsUpdate = true;

  geometry.translate(0, 0, -depth / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
