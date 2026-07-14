export interface PathGoal {
  isEnd(pos: { x: number; y: number; z: number }): boolean;
  heuristic(pos: { x: number; y: number; z: number }): number;
}

function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2);
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

export class GoalFollow implements PathGoal {
  constructor(public entity: any, public distance: number) {}
  isEnd(pos: { x: number; y: number; z: number }): boolean {
    if (!this.entity?.position) return false;
    const p = this.entity.position;
    return dist3(pos.x, pos.y, pos.z, p.x, p.y, p.z) <= this.distance;
  }
  heuristic(pos: { x: number; y: number; z: number }): number {
    if (!this.entity?.position) return Infinity;
    const p = this.entity.position;
    return dist3(pos.x, pos.y, pos.z, p.x, p.y, p.z);
  }
}

export class GoalXZ implements PathGoal {
  constructor(public x: number, public z: number) {}
  isEnd(pos: { x: number; y: number; z: number }): boolean {
    return Math.abs(pos.x - this.x) <= 0.5 && Math.abs(pos.z - this.z) <= 0.5;
  }
  heuristic(pos: { x: number; y: number; z: number }): number {
    return distXZ(pos.x, pos.z, this.x, this.z);
  }
}

export class GoalNear implements PathGoal {
  constructor(public x: number, public y: number, public z: number, public range: number) {}
  isEnd(pos: { x: number; y: number; z: number }): boolean {
    return dist3(pos.x, pos.y, pos.z, this.x, this.y, this.z) <= this.range;
  }
  heuristic(pos: { x: number; y: number; z: number }): number {
    return dist3(pos.x, pos.y, pos.z, this.x, this.y, this.z);
  }
}

export class GoalGetToBlock implements PathGoal {
  constructor(public x: number, public y: number, public z: number) {}
  isEnd(pos: { x: number; y: number; z: number }): boolean {
    const cx = this.x + 0.5;
    const cy = this.y;
    const cz = this.z + 0.5;
    const dx = Math.abs(pos.x - cx);
    const dz = Math.abs(pos.z - cz);
    const dy = pos.y - cy;
    return dx <= 1.0 && dz <= 1.0 && dy >= -1 && dy <= 2;
  }
  heuristic(pos: { x: number; y: number; z: number }): number {
    const cx = this.x + 0.5;
    const cz = this.z + 0.5;
    return Math.sqrt((pos.x - cx) ** 2 + (pos.z - cz) ** 2);
  }
}