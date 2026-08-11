export type PetMode = "idle" | "interaction";

export interface PetViewState {
  mode: PetMode;
  imageSource: string;
  contextMenuOpen: boolean;
}

export const initialPetViewState: PetViewState = {
  mode: "idle",
  imageSource: "",
  contextMenuOpen: false,
};
