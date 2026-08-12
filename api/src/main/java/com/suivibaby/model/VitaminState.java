package com.suivibaby.model;

import java.util.UUID;

public record VitaminState(VitaminType vitaminType, boolean given, UUID authorId) {
}
