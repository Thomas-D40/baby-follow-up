package com.suivibaby.model;

import java.util.UUID;

// Label only, on purpose (D18-Y): the list is shared by every user, so neither the author nor any
// baby or date may leak through it.
public record DishResponse(UUID id, String label) {
}
