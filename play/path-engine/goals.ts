export interface PathGoal {
  isEnd(nodePos: { x: number; y: number; z: number }): boolean;
  isReached(botPos: { x: number; y: number; z: number }): boolean;
  heuristic(nodePos: { x: number; y: number; z: number }): number;
}

function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2);
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);
}

export class GoalFollow implements PathGoal {
  constructor(public entity: any, public distance: number) {}
  isEnd(nodePos: { x: number; y: number; z: number }): boolean {
    if (!this.entity?.position) return false;
    const p = this.entity.position;
    return dist3(nodePos.x + 0.5, nodePos.y, nodePos.z + 0.5, p.x, p.y, p.z) <= this.distance;
  }
  isReached(botPos: { x: number; y: number; z: number }): boolean {
    if (!this.entity?.position) return false;
    const p = this.entity.position;
    return dist3(botPos.x, botPos.y, botPos.z, p.x, p.y, p.z) <= this.distance;
  }
  heuristic(nodePos: { x: number; y: number; z: number }): number {
    if (!this.entity?.position) return Infinity;
    const p = this.entity.position;
    return dist3(nodePos.x + 0.5, nodePos.y, nodePos.z + 0.5, p.x, p.y, p.z);
  }
}

export class GoalXZ implements PathGoal {
  constructor(public x: number, public z: number) {}
  isEnd(nodePos: { x: number; y: number; z: number }): boolean {
    return nodePos.x === this.x && nodePos.z === this.z;
  }
  isReached(botPos: { x: number; y: number; z: number }): boolean {
    return (
      Math.abs(botPos.x - (this.x + 0.5)) <= 0.5 &&
      Math.abs(botPos.z - (this.z + 0.5)) <= 0.5
    );
  }
  heuristic(nodePos: { x: number; y: number; z: number }): number {
    return distXZ(nodePos.x, nodePos.z, this.x, this.z);
  }
}

export class GoalNear implements PathGoal {
  constructor(public x: number, public y: number, public z: number, public range: number) {}
  isEnd(nodePos: { x: number; y: number; z: number }): boolean {
    return dist3(nodePos.x + 0.5, nodePos.y, nodePos.z + 0.5, this.x, this.y, this.z) <= this.range;
  }
  isReached(botPos: { x: number; y: number; z: number }): boolean {
    return dist3(botPos.x, botPos.y, botPos.z, this.x, this.y, this.z) <= this.range;
  }
  heuristic(nodePos: { x: number; y: number; z: number }): number {
    return dist3(nodePos.x + 0.5, nodePos.y, nodePos.z + 0.5, this.x, this.y, this.z);
  }
}

export class GoalGetToBlock implements PathGoal {
  constructor(public x: number, public y: number, public z: number) {}
  isEnd(nodePos: { x: number; y: number; z: number }): boolean {
    const dx = Math.abs(nodePos.x - this.x);
    const dz = Math.abs(nodePos.z - this.z);
    const dy = nodePos.y - this.y;
    return dx <= 1 && dz <= 1 && dy >= -1 && dy <= 2;
  }
  isReached(botPos: { x: number; y: number; z: number }): boolean {
    const cx = this.x + 0.5;
    const cz = this.z + 0.5;
    const dx = Math.abs(botPos.x - cx);
    const dz = Math.abs(botPos.z - cz);
    const dy = botPos.y - this.y;
    return dx <= 1.5 && dz <= 1.5 && dy >= -1 && dy <= 2;
  }
  heuristic(nodePos: { x: number; y: number; z: number }): number {
    const cx = this.x + 0.5;
    const cz = this.z + 0.5;
    return Math.sqrt((nodePos.x + 0.5 - cx) ** 2 + (nodePos.z + 0.5 - cz) ** 2);
  }
}