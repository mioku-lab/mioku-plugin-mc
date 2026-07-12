export {};

declare module "minecraft-data" {
  export interface IndexedData {
    blocksByName: Record<string, any>;
    itemsByName: Record<string, any>;
    entitiesByName: Record<string, any>;
    foodsByName?: Record<string, any>;
    items?: any[];
    [key: string]: any;
  }
  function minecraftData(version: string): IndexedData;
  export default minecraftData;
}
