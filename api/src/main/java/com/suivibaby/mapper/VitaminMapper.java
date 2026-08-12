package com.suivibaby.mapper;

import com.suivibaby.entity.VitaminIntake;
import com.suivibaby.model.VitaminDayResponse;
import com.suivibaby.model.VitaminState;
import com.suivibaby.model.VitaminType;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@ApplicationScoped
public class VitaminMapper {

    /**
     * Construit la **matrice complète** du jour (D9-B) : une entrée par type de vitamine connu, cochée
     * si une ligne existe. Le service itère l'enum, jamais les lignes → le front n'a pas à connaître la
     * liste des types.
     */
    public VitaminDayResponse toDayResponse(LocalDate day, List<VitaminIntake> rows) {
        List<VitaminState> items = new ArrayList<>();
        for (VitaminType type : VitaminType.values()) {
            VitaminIntake row = rows.stream()
                    .filter(r -> r.vitaminType == type)
                    .findFirst()
                    .orElse(null);
            items.add(new VitaminState(type, row != null, row == null ? null : row.authorId));
        }
        return new VitaminDayResponse(day, items);
    }

    public VitaminState toState(VitaminType type, VitaminIntake row) {
        return new VitaminState(type, row != null, row == null ? null : row.authorId);
    }
}
